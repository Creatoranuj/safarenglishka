// Safar English — Native debug helpers.
//
// Pipes unhandled JS errors to native logcat / Xcode console so APK builds in
// the wild can be debugged via `adb logcat | grep Capacitor` without USB
// devtools attached. Visit any route with `?debug=1` to show an in-app
// overlay with the last 50 console lines — invaluable for QA on physical
// devices.

import { logger } from "./logger";


interface ConsoleLine {
  level: "log" | "warn" | "error";
  ts: number;
  msg: string;
}

const buffer: ConsoleLine[] = [];
const MAX_LINES = 50;

function pushLine(level: ConsoleLine["level"], args: unknown[]) {
  try {
    const msg = args
      .map((a) =>
        typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()
      )
      .join(" ");
    buffer.push({ level, ts: Date.now(), msg: msg.slice(0, 500) });
    if (buffer.length > MAX_LINES) buffer.shift();
    renderOverlayIfVisible();
  } catch {
    // ignore
  }
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

let overlayEl: HTMLDivElement | null = null;
function renderOverlayIfVisible() {
  if (!overlayEl) return;
  overlayEl.innerHTML = buffer
    .slice()
    .reverse()
    .map(
      (l) =>
        `<div style="color:${l.level === "error" ? "#ff6b6b" : l.level === "warn" ? "#ffd166" : "#a8dadc"};margin-bottom:4px"><span style="opacity:.6">${fmtTime(l.ts)}</span> ${escapeHtml(l.msg)}</div>`
    )
    .join("");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function mountOverlay() {
  if (overlayEl || typeof document === "undefined") return;
  overlayEl = document.createElement("div");
  overlayEl.id = "nb-debug-overlay";
  overlayEl.setAttribute("aria-label", "Debug console");
  Object.assign(overlayEl.style, {
    position: "fixed",
    left: "8px",
    right: "8px",
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
    maxHeight: "40vh",
    overflowY: "auto",
    background: "rgba(0,0,0,0.85)",
    color: "#fff",
    font: "11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
    padding: "8px 10px",
    borderRadius: "8px",
    zIndex: "2147483647",
    pointerEvents: "auto",
    backdropFilter: "blur(4px)",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(overlayEl);
  renderOverlayIfVisible();
}

function isExpectedCapacitorNoise(reason: unknown): boolean {
  try {
    const msg = Array.isArray(reason)
      ? reason.map((part) => typeof part === "string" ? part : JSON.stringify(part)).join(" ")
      : String((reason as { message?: string; code?: string } | null)?.message ?? reason ?? "");
    const code = String((reason as { code?: string } | null)?.code ?? "");
    // Keyboard plugin no-op on web fallback.
    if (/Keyboard\.(set|get)ResizeMode|setResizeMode|getResizeMode/i.test(msg) &&
      /UNIMPLEMENTED|not implemented/i.test(`${msg} ${code}`)) return true;
    // Eruda cross-origin ErrorEvent with stripped message/filename/lineno
    // ("[window.error] undefined undefined undefined"). Always vendor noise —
    // Eruda's own window.error handler receiving a synthetic event with no
    // useful fields. See audit Batch 1 Now #3.
    if (/\[window\.error\]\s+undefined\s+undefined\s+undefined/i.test(msg)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Routine AbortError noise from vendor code that calls console.error directly
 * instead of throwing an unhandled rejection.
 *
 * Known emitters:
 *  - pdf.js worker stream (`setupMessageHandler` → `sink.onCancel`) fires on
 *    every PDF viewer unmount / route change.
 *  - react-query / react-notion-x abort in-flight fetches on unmount.
 *
 * Matched at the console.error boundary so both the Eruda overlay and the
 * Sentry forwarder (src/lib/sentry.ts) stay clean. See skill:
 * `console-error-triage` — Level 3 (narrowest suppression, vendor origin).
 *
 * EXPORTED so main.tsx can re-apply the filter AFTER Eruda inits (Eruda
 * wraps console.error at init time and becomes the outermost layer, so our
 * in-nativeDebug filter alone can't stop the entry from reaching Eruda's
 * panel — Eruda's wrapper runs first).
 */
export function isRoutineAbortNoise(args: unknown[]): boolean {
  try {
    for (const a of args) {
      if (!a) continue;
      const name = (a as { name?: string }).name;
      if (name === "AbortError") return true;
      const msg = typeof a === "string"
        ? a
        : String((a as { message?: string }).message ?? "");
      if (!msg) continue;
      if (/AbortError|operation was aborted|user aborted a request/i.test(msg)) {
        // Extra safety: only suppress when the stack clearly points at
        // pdf.js / vendor. Prevents hiding an AbortError we ourselves logged.
        const stack = String((a as { stack?: string }).stack ?? "");
        if (
          !stack ||
          /pdfjs|pdf\.mjs|pdf\.worker|setupMessageHandler|onCancel|node_modules|react-notion-x/i.test(stack)
        ) {
          return true;
        }
      }
    }
  } catch { /* ignore */ }
  return false;
}

export function isExpectedConsoleNoise(args: unknown[]): boolean {
  return isExpectedCapacitorNoise(args) || isRoutineAbortNoise(args);
}

// F1.1 — re-entry guard for the console wrapper. If our filter throws (or a
// downstream listener calls console.error again from within), we must not
// recurse into ourselves. Bounded to the current sync frame.
let consoleInFlight = false;

export function initNativeDebug(): void {
  if (typeof window === "undefined") return;
  // Expose the noise filter on globalThis so the early Eruda bootstrap in
  // main.tsx can reuse it without needing a dynamic import (which would
  // duplicate the chunk).
  (globalThis as unknown as { __nb_isExpectedConsoleNoise?: (args: unknown[]) => boolean }).__nb_isExpectedConsoleNoise = isExpectedConsoleNoise;


  // Wrap console methods (capture for overlay; native bridges still relay to
  // logcat / Xcode console automatically).
  (["log", "warn", "error"] as const).forEach((k) => {
    const orig = console[k].bind(console);
    console[k] = (...args: unknown[]) => {
      if (consoleInFlight) { orig(...args); return; }
      consoleInFlight = true;
      try {
        if (k === "error" && (isExpectedCapacitorNoise(args) || isRoutineAbortNoise(args))) return;
        pushLine(k, args);
        orig(...args);
      } finally {
        consoleInFlight = false;
      }
    };
  });


  // NOTE: capture-phase + stopImmediatePropagation so third-party listeners
  // (Eruda's console panel, Sentry global handler) never see routine noise.
  // Without capture phase, Eruda's listener runs first and logs AbortError
  // into its panel regardless of preventDefault (screenshot 20260701-225200).
  window.addEventListener("error", (e) => {
    const err = (e as ErrorEvent).error ?? null;
    if (isRoutineAbortNoise([err ?? e.message])) {
      try { e.preventDefault(); e.stopImmediatePropagation(); } catch { /* noop */ }
      return;
    }
    // Batch 2.5 Now #1 — Eruda + some vendor libs synthesize empty ErrorEvents
    // (message/filename/lineno all undefined). Suppress at source; forwarding
    // "[window.error] undefined undefined undefined" adds only noise.
    if (!e.message && !e.filename && !e.lineno && !err) {
      try { e.preventDefault(); e.stopImmediatePropagation(); } catch { /* noop */ }
      return;
    }
    // Resource-load failures (img/script/link) surface as ErrorEvents whose
    // target is an HTMLElement, not window. Eruda logs them as
    // "[window.error] undefined undefined undefined". Suppress at source.
    if (e.target && e.target !== window && (e.target as Node).nodeType === 1) {
      try { e.stopImmediatePropagation(); } catch { /* noop */ }
      return;
    }
    // Batch 2.6 — Eruda's own error panel re-throws synthetic ErrorEvents
    // whose stack points back into `assets/eruda-*.js`. Those are the tool
    // reporting on itself, never a real app crash. Stop propagation so the
    // Sentry forwarder in main.tsx does not ingest them.
    const stack = String((err as { stack?: string } | null)?.stack ?? "");
    const filename = String(e.filename ?? "");
    if (/\/assets\/eruda[-.]/i.test(stack) || /\/assets\/eruda[-.]/i.test(filename)) {
      try { e.preventDefault(); e.stopImmediatePropagation(); } catch { /* noop */ }
      return;
    }
    logger.error("[window.error]", e.message, { filename: e.filename, lineno: e.lineno });
  }, true);
  window.addEventListener("unhandledrejection", (e) => {
    if (isExpectedCapacitorNoise(e.reason) || isRoutineAbortNoise([e.reason])) {
      try { e.preventDefault(); e.stopImmediatePropagation(); } catch { /* noop */ }
      return;
    }
    const reason = e.reason as { name?: string; message?: string; stack?: string } | null;
    const msg = reason?.message ?? String(e.reason ?? "");
    logger.error("[unhandledrejection]", reason?.stack || msg || e.reason);
  }, true);

  try {
    const debugOn = new URLSearchParams(window.location.search).has("debug");
    if (debugOn) mountOverlay();
  } catch {
    // ignore
  }
}
