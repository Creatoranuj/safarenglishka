/**
 * Single reload arbiter.
 *
 * The app previously had THREE independent auto-reload systems, each with its
 * own cooldown guard that the other two knew nothing about:
 *
 *   1. `crashShield`        — 60s cooldown mirrored in session + local storage
 *   2. `useResumeRecovery`  — one-shot `sessionStorage` key
 *   3. boot watchdog (main) — 60s `sessionStorage` key
 *
 * Two failure modes came out of that:
 *
 *   - One system's reload consumed the guard another system needed, so the
 *     one that could actually recover was locked out.
 *   - A reload could be issued while the WebView was hidden / mid-restore.
 *     The document reloads, React never commits a first paint, and the boot
 *     watchdog is already inside its own cooldown from that same reload — the
 *     user lands on the bare `#F7F4EE` background (the cream blank screen).
 *
 * Every reload decision now goes through `requestReload()`, which:
 *   - owns ONE shared cooldown (session + local mirror, so an OOM-induced
 *     WebView process death can't reset it),
 *   - defers the reload while `document.visibilityState === "hidden"` and runs
 *     it on the next `visible` transition,
 *   - supports `force` for unambiguous states (empty `#root`) that must be
 *     able to bypass the cooldown,
 *   - records a breadcrumb + local diagnostic for EVERY decision — granted,
 *     suppressed or deferred — so the next occurrence names its own cause.
 */

import { addBreadcrumb } from "./sentry";
import { safeGet, safeSet, safeSessionGet, safeSessionSet } from "./storage";
import { recordDiagnostic } from "./freezeDiagnostics";

const RELOAD_KEY = "nb_crash_reload_at";
export const RELOAD_COOLDOWN_MS = 60_000;

export type ReloadSystem = "crash-shield" | "resume-recovery" | "boot-watchdog";
export type ReloadDecision = "granted" | "deferred" | "suppressed";

export interface ReloadRequest {
  system: ReloadSystem;
  reason: string;
  /** Bypass the cooldown. Only for unambiguous states (blank root). */
  force?: boolean;
}

function readReloadAt(): number {
  const a = Number(safeSessionGet(RELOAD_KEY) || "0");
  const b = Number(safeGet(RELOAD_KEY) || "0");
  return Math.max(a, b);
}

function markReloaded(): void {
  const now = String(Date.now());
  safeSessionSet(RELOAD_KEY, now);
  safeSet(RELOAD_KEY, now);
}

/** True when the shared cooldown window has elapsed. */
export function canReload(): boolean {
  return Date.now() - readReloadAt() > RELOAD_COOLDOWN_MS;
}

/** Test seam — reset the shared cooldown. */
export function resetReloadCooldown(): void {
  safeSessionSet(RELOAD_KEY, "0");
  safeSet(RELOAD_KEY, "0");
  pending = null;
}

function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function rootChildCount(): number {
  try {
    return document.getElementById("root")?.childElementCount ?? -1;
  } catch {
    return -1;
  }
}

function breadcrumb(decision: ReloadDecision, req: ReloadRequest): void {
  const detail = {
    system: req.system,
    reason: req.reason,
    decision,
    force: Boolean(req.force),
    visibility: typeof document !== "undefined" ? document.visibilityState : "unknown",
    rootChildren: rootChildCount(),
    route: typeof window !== "undefined" ? window.location.pathname : "unknown",
  };
  try {
    addBreadcrumb("reload-arbiter", `${decision}: ${req.system} — ${req.reason}`, detail);
  } catch {
    /* noop */
  }
  try {
    recordDiagnostic(
      "freeze",
      `reload ${decision} [${req.system}] ${req.reason} vis=${detail.visibility} root=${detail.rootChildren}`,
    );
  } catch {
    /* noop */
  }
  console.warn(`[reload-arbiter] ${decision}:`, req.system, req.reason, detail);
}

let pending: ReloadRequest | null = null;
let visibilityHooked = false;

function hookVisibility(): void {
  if (visibilityHooked || typeof document === "undefined") return;
  visibilityHooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const queued = pending;
    if (!queued) return;
    pending = null;
    // The deferred request already passed the cooldown check when queued.
    requestReload({ ...queued, force: true });
  });
}

function doReload(): void {
  try {
    window.location.reload();
  } catch {
    /* noop */
  }
}

/**
 * Ask for a reload. Returns the decision taken.
 * A `deferred` request runs automatically once the document becomes visible.
 */
export function requestReload(req: ReloadRequest): ReloadDecision {
  if (typeof window === "undefined") return "suppressed";
  hookVisibility();

  if (!req.force && !canReload()) {
    breadcrumb("suppressed", req);
    return "suppressed";
  }

  // Never reload a hidden WebView: the document reloads without ever
  // committing a paint, and the user returns to a blank root.
  if (isHidden()) {
    pending = req;
    breadcrumb("deferred", req);
    return "deferred";
  }

  markReloaded();
  breadcrumb("granted", req);
  doReload();
  return "granted";
}
