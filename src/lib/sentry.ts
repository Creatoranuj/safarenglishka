// Sentry is dynamically imported so the ~40KB SDK never lands in the initial
// entry chunk. We still expose synchronous-callable helpers; calls made before
// the SDK finishes loading are queued (or dropped, for breadcrumbs in prod
// without a DSN — there's nothing to record anyway).

type SentryModule = typeof import("@sentry/react");
import { safeGet } from "./storage";

let sentryMod: SentryModule | null = null;
let loading: Promise<SentryModule | null> | null = null;
let initialized = false;
let warnedMissingDsn = false;

// Sentry DSN comes exclusively from the build-time env var so the value can
// be rotated without shipping a new bundle, forks don't burn our quota, and
// audit finding F4.1 (SEC — un-rotatable hard-coded DSN) stays closed.
function getDsn(): string | undefined {
  const envDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  return envDsn && envDsn.trim() ? envDsn : undefined;
}

// Live sampling knob — read from public.app_config.sentry_traces_sample_rate
// so admins can dial trace sampling during an incident without redeploying
// the app. Falls back to 0.1 if the fetch fails (offline cold-start, RLS
// glitch, column missing on an older schema). Bounded 0–1 defensively even
// though the column has a CHECK constraint.
async function fetchTracesSampleRate(): Promise<number> {
  const FALLBACK = 0.1;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const { data, error } = await supabase
      .from("app_config")
      .select("sentry_traces_sample_rate")
      .abortSignal(ctrl.signal)
      .limit(1)
      .maybeSingle();
    clearTimeout(timer);
    if (error || !data) return FALLBACK;
    const raw = (data as { sentry_traces_sample_rate?: number | string | null })
      .sentry_traces_sample_rate;
    const n = typeof raw === "string" ? parseFloat(raw) : raw;
    if (typeof n !== "number" || !Number.isFinite(n)) return FALLBACK;
    return Math.min(1, Math.max(0, n));
  } catch {
    return FALLBACK;
  }
}

/**
 * Strip query strings (signed-URL tokens, `?token=…`, `?jwt=…`, etc.) before
 * a URL is sent to Sentry. Closes F2.3 — signed URLs were leaking into event
 * payloads as tags/extra context.
 */
export function redactUrl(u: string | undefined | null, max = 120): string {
  if (!u) return "";
  try {
    const q = u.indexOf("?");
    const base = q >= 0 ? u.slice(0, q) : u;
    return base.slice(0, max);
  } catch {
    return String(u).slice(0, max);
  }
}

function shouldLoad(): boolean {
  // Prod builds always send when a DSN is available.
  if (import.meta.env.PROD) return Boolean(getDsn());
  // Dev/preview escape hatch — set VITE_SENTRY_FORCE=1 to smoke-test the
  // Sentry pipeline from the Lovable preview without publishing. Keep OFF
  // long-term: dev noise burns Sentry quota fast.
  if (import.meta.env.VITE_SENTRY_FORCE === "1") return Boolean(getDsn());
  return false;
}

function loadSentry(): Promise<SentryModule | null> {
  if (sentryMod) return Promise.resolve(sentryMod);
  if (loading) return loading;
  if (!shouldLoad()) return Promise.resolve(null);
  loading = import("@sentry/react")
    .then((m) => {
      sentryMod = m;
      return m;
    })
    .catch(() => null);
  return loading;
}

/**
 * Initialize Sentry in production only. Safe to call multiple times.
 * Set VITE_SENTRY_DSN in production env to activate; otherwise no-op.
 * Async: loads the SDK on demand so it stays out of the initial chunk.
 */
export async function initSentry(): Promise<void> {
  if (initialized) return;
  if (!shouldLoad()) {
    // OBS (audit MED): warn once in prod if DSN is missing so observability
    // regressions are caught in Eruda / adb logcat instead of silently
    // dropping every captureException + console.error forward.
    // Preview / DSN-less prod: stay silent by default to avoid console noise.
    // Set localStorage `nb_sentry_debug=1` to surface the disabled-state hint.
    if (import.meta.env.PROD && !getDsn() && !warnedMissingDsn) {
      warnedMissingDsn = true;
      if (safeGet("nb_sentry_debug") === "1") {
         
        console.info("[sentry] disabled: VITE_SENTRY_DSN missing");
      }
    }
    return;
  }
  const mod = await loadSentry();
  if (!mod || initialized) return;
  try {
    mod.init({
      dsn: getDsn() as string,
      environment: import.meta.env.PROD ? "production" : "preview-forced",
      // Release health — matches SENTRY_RELEASE format used by
      // sentry-cli in .github/workflows/build-apk.yml so events group
      // by the same version tag CI creates.
      release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
      tracesSampleRate: await fetchTracesSampleRate(),
      // PII scrub — strip emails, mobile numbers, JWT-like tokens, and
      // Bearer headers from every event payload before send. Layered on
      // top of Sentry's built-in sendDefaultPii=false.
      beforeSend: (event) => {
        // 1) Strip eruda / vendor-sentry frames from stack fingerprints so
        //    admin devtool wrappers don't dominate the grouping.
        stripNoisyFrames(event as unknown as Record<string, unknown>);
        // 2) Drop bursts of the same error inside a 5 s window — the
        //    console-forwarder + window.onunhandledrejection + Sentry's own
        //    native handler routinely triple-report `TypeError: Failed to fetch`.
        if (isDuplicateWithinWindow(event as unknown as Record<string, unknown>)) return null;
        return scrubEventPii(event as unknown as Record<string, unknown>) as unknown as typeof event;
      },
      beforeBreadcrumb: (crumb) => {
        // Drop `data:` URL payloads entirely — a fetch on a `data:application/pdf;base64,…`
        // captures the whole HTML/PDF body (megabytes, potential PII) into the
        // breadcrumb ring. Only the fact that a `data:` URL was fetched is useful.
        if (crumb?.data && typeof (crumb.data as { url?: unknown }).url === "string") {
          const u = (crumb.data as { url: string }).url;
          if (/^data:/i.test(u)) {
            (crumb.data as { url: string }).url = `data:[dropped ${u.length}b]`;
          } else {
            (crumb.data as { url: string }).url = redactUrl(u, 200);
          }
        }
        if (crumb?.message) crumb.message = scrubString(crumb.message);
        if (crumb?.data) crumb.data = scrubObject(crumb.data);
        return crumb;
      },
      // Replay & Profiling integrations intentionally NOT registered — keeps
      // the Sentry vendor chunk lean (~70KB gzip saved vs. enabling Replay).
      // If you re-enable, add `Sentry.replayIntegration()` to `integrations:`.
    });
    initialized = true;
    // OBS hardening — closes HIGH "Errors swallowed by console.error".
    // Forward every console.error in prod through Sentry so the existing
    // ~50 silent error sites (hooks/lib) automatically get observability.
    // Original console.error still runs for adb logcat / Eruda.
    installConsoleErrorForwarder();
  } catch {
    /* never break the app for telemetry */
  }
}

// =============================================================
// PII scrubbing — email, mobile (IN + generic), JWT, Bearer tokens
// =============================================================
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]"],
  [/\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, "[phone]"], // Indian mobile
  [/\b\d{10,15}\b/g, "[num]"],                     // generic long numeric run
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]"],
  [/Bearer\s+[A-Za-z0-9._-]{16,}/gi, "Bearer [redacted]"],
];

function scrubString(s: string): string {
  let out = s;
  for (const [re, rep] of PII_PATTERNS) out = out.replace(re, rep);
  return out;
}

function scrubObject<T>(v: T): T {
  if (v == null) return v;
  if (typeof v === "string") return scrubString(v) as unknown as T;
  if (Array.isArray(v)) return v.map(scrubObject) as unknown as T;
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = scrubObject(val);
    }
    return out as T;
  }
  return v;
}

function scrubEventPii(event: Record<string, unknown>): Record<string, unknown> {
  try {
    return scrubObject(event);
  } catch {
    return event;
  }
}

// Module-level guard — patching console.error twice would create infinite
// recursion (forwarder calls captureException which calls Sentry which may
// call console.error on its own failure path).
let consoleErrorPatched = false;
// F1.1 — re-entry guard. If `captureException` itself throws and Sentry's
// own code paths call `console.error`, we would recurse infinitely because
// our wrapper is now the outermost console.error. This flag short-circuits
// re-entrant calls back to the original console.error.
let forwarderInFlight = false;
// ---- beforeSend helpers ------------------------------------------------
// Collapse triple-reported errors (console.error forwarder + unhandledrejection
// + Sentry's own captureException) so a single failure doesn't burn 3× quota
// and doesn't split the Issue fingerprint.
const recentEventKeys = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5000;
function isDuplicateWithinWindow(event: Record<string, unknown>): boolean {
  try {
    const ex = (event as { exception?: { values?: Array<{ type?: string; value?: string; stacktrace?: { frames?: Array<{ filename?: string; function?: string }> } }> } }).exception;
    const first = ex?.values?.[0];
    const top = first?.stacktrace?.frames?.[first.stacktrace.frames.length - 1];
    const key = `${first?.type ?? ""}|${first?.value ?? ""}|${top?.filename ?? ""}|${top?.function ?? ""}`;
    const now = Date.now();
    // Prune old entries opportunistically.
    if (recentEventKeys.size > 64) {
      for (const [k, t] of recentEventKeys) if (now - t > DEDUPE_WINDOW_MS) recentEventKeys.delete(k);
    }
    const last = recentEventKeys.get(key);
    if (last && now - last < DEDUPE_WINDOW_MS) return true;
    recentEventKeys.set(key, now);
    return false;
  } catch { return false; }
}

// Strip Eruda devtool frames and Sentry-vendor internals so the fingerprint
// picks the actual app frame (fileUtils, useLocalPdfSource, etc).
const NOISY_FRAME_RE = /(eruda-[^/]+\.js|vendor-sentry-[^/]+\.js)/i;
function stripNoisyFrames(event: Record<string, unknown>): void {
  try {
    const ex = (event as { exception?: { values?: Array<{ stacktrace?: { frames?: Array<{ filename?: string }> } }> } }).exception;
    for (const v of ex?.values ?? []) {
      const frames = v.stacktrace?.frames;
      if (!frames) continue;
      v.stacktrace!.frames = frames.filter((f) => !NOISY_FRAME_RE.test(f.filename ?? ""));
    }
  } catch { /* ignore */ }
}

/**
 * Console-forward suppression. `logger.error` already ships the error to
 * Sentry via `captureException`; its `console.error` mirror used to create a
 * SECOND issue with a different stack (the forwarder frame). Callers that
 * already report explicitly wrap their console write in this helper so the
 * forwarder stays silent — one failure, one Sentry issue.
 */
let forwardSuppressDepth = 0;
export function withConsoleForwardSuppressed<T>(fn: () => T): T {
  forwardSuppressDepth++;
  try { return fn(); } finally { forwardSuppressDepth--; }
}

function installConsoleErrorForwarder(): void {
  if (consoleErrorPatched) return;
  consoleErrorPatched = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (forwarderInFlight || forwardSuppressDepth > 0) { original(...args); return; }

    // React dev-mode warnings (`Warning: ...`, e.g. "Function components cannot
    // be given refs" emitted by dev tooling / third-party portals) go through
    // console.error but are not runtime failures and don't exist in prod builds.
    // Forwarding them buries real issues during triage — keep them console-only.
    if (typeof args[0] === "string" && /^Warning: /.test(args[0])) { original(...args); return; }
    forwarderInFlight = true;
    try {
      // First arg shapes the Sentry event. If it's already an Error, ship it
      // directly; otherwise stringify the first 2 args as the message.
      const first = args[0];
      const err =
        first instanceof Error
          ? first
          : new Error(args.slice(0, 2).map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" "));
      captureException(err, { source: "console.error", argCount: args.length });
    } catch { /* never let telemetry break logging */ }
    finally { forwarderInFlight = false; }
    original(...args);
  };
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

/**
 * Error taxonomy for triage. Sentry groups by stack frame, which meant one
 * offline blip showed up as three separate issues (console forwarder,
 * unhandled-rejection trap, Sentry's own handler). Tagging by *cause* lets
 * triage filter `nb_kind:network` and close a whole class at once.
 */
export type ErrorKind = "network" | "pdf-source" | "proxy" | "native" | "app";

const KIND_RULES: Array<[ErrorKind, RegExp]> = [
  // `Software caused connection abort` / `connection reset` are Android socket
  // drops surfaced by the native HTTP bridge — same class as a failed fetch.
  ["network", /network error|failed to fetch|\bload failed\b|networkerror|err_internet_disconnected|err_connection|connection abort|connection reset|socket|timeout|aborted/i],
  // Upstream 5xx (proxy, CDN, storage) is availability telemetry, not a defect
  // in our code — keep it at `warning` so the crash-rate metric stays honest.
  ["proxy", /storage proxy unavailable|pdf-proxy|responseexception|unexpected server response \(5\d\d\)|download failed \(http 5\d\d\)|\bhttp 5\d\d\b/i],
  ["pdf-source", /invalidpdf|unknownerrorexception|missingpdf|password.*pdf|invalid pdf structure|datacloneerror/i],
  ["native", /capacitor|unimplemented|downloadfile|filesystem|not implemented on (android|ios|web)/i],
];

export function classifyError(err: unknown): ErrorKind {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "");
  for (const [kind, re] of KIND_RULES) if (re.test(msg)) return kind;
  return "app";
}

/**
 * Expected offline/third-party failures are reliability signal, not crashes.
 * Reporting them at `warning` keeps the crash-rate metric honest.
 */
function levelForKind(kind: ErrorKind): "error" | "warning" {
  return kind === "network" || kind === "proxy" ? "warning" : "error";
}

/** Thin wrapper used by new code. Same shape as console.error but explicit. */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  captureException(err, context);
}

/**
 * Same failure reported from two paths (explicit report + an unhandled
 * rejection trap a tick later) used to open two issues. Drop repeats of the
 * same message inside a short window.
 */
const REPORT_DEDUPE_WINDOW_MS = 5000;

const recentReports = new Map<string, number>();
function isDuplicate(signature: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentReports) if (now - t > REPORT_DEDUPE_WINDOW_MS) recentReports.delete(k);
  const seen = recentReports.get(signature);
  recentReports.set(signature, now);
  return seen != null && now - seen <= REPORT_DEDUPE_WINDOW_MS;

}

/**
 * Network failures are the single noisiest class in this app: a student on
 * flaky mobile data produces `Failed to fetch` / `network error` from four
 * different frames, and `navigator.onLine` stays `true` the whole time (the
 * radio is attached, the packets just don't land). Those are reliability
 * telemetry, not defects — so the first few per host become breadcrumbs, and
 * only a *persistent* failure (same host, >= threshold in one session) is
 * escalated to an exception under a single stable fingerprint.
 */
const NETWORK_ESCALATE_AFTER = 4;
const networkFailuresByHost = new Map<string, number>();

export function hostOf(value: unknown): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  const match = text.match(/https?:\/\/([^/\s"')]+)/i);
  return match ? match[1] : "unknown-host";
}

/** Test seam — resets the per-session network counters. */
export function __resetNetworkNoiseState(): void {
  networkFailuresByHost.clear();
  recentReports.clear();
}

export function captureException(err: unknown, context?: Record<string, unknown>) {
  if (!shouldLoad()) return;
  const kind = classifyError(err);
  const signature = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "");

  // A rejection carrying no message, no name and no stack can never be acted
  // on — it lands in Sentry as `<unknown>` / `{}`. Drop it at the source.
  const hasStack = err instanceof Error && typeof err.stack === "string" && err.stack.length > 0;
  if (!hasStack && signature.replace(/[{}\s[\]"]/g, "").length === 0) return;

  if (kind === "network") {
    // Device is genuinely offline: a failed fetch is expected, not a defect.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const host = hostOf(context?.url ?? context?.href ?? signature);
    const count = (networkFailuresByHost.get(host) ?? 0) + 1;
    networkFailuresByHost.set(host, count);
    if (count < NETWORK_ESCALATE_AFTER) {
      addBreadcrumb("network", signature.slice(0, 160), { host, count, ...(context ?? {}) });
      return;
    }
    if (isDuplicate(`network:${host}`)) return;
    loadSentry().then((mod) => {
      if (!mod || !initialized) return;
      try {
        mod.captureException(err, {
          level: "warning",
          tags: { nb_kind: "network", nb_host: host },
          fingerprint: ["nb-network", host],
          extra: { host, failures: count, ...(context ?? {}) },
        });
      } catch { /* ignore */ }
    });
    return;
  }

  if (isDuplicate(signature)) return;

  loadSentry().then((mod) => {
    if (!mod || !initialized) return;
    try {
      mod.captureException(err, {
        level: levelForKind(kind),
        tags: { nb_kind: kind },
        ...(context ? { extra: context } : {}),
      });
    } catch {
      /* ignore */
    }
  });
}


/**
 * Lightweight breadcrumb logger. In dev (Sentry not initialised) it falls back
 * to console so PDF actions are still traceable while debugging.
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
) {
  if (import.meta.env.DEV) {
    try { console.debug(`[breadcrumb:${category}] ${message}`, data ?? ""); } catch { /* ignore */ }
    return;
  }
  if (!shouldLoad()) return;
  loadSentry().then((mod) => {
    if (!mod || !initialized) return;
    try {
      mod.addBreadcrumb({ category, message, level: "info", data });
    } catch {
      /* ignore */
    }
  });
}