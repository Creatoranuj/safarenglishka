// Sentry is dynamically imported so the ~40KB SDK never lands in the initial
// entry chunk. We still expose synchronous-callable helpers; calls made before
// the SDK finishes loading are queued (or dropped, for breadcrumbs in prod
// without a DSN — there's nothing to record anyway).

type SentryModule = typeof import("@sentry/react");

let sentryMod: SentryModule | null = null;
let loading: Promise<SentryModule | null> | null = null;
let initialized = false;

function shouldLoad(): boolean {
  if (!import.meta.env.PROD) return false;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  return Boolean(dsn);
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
  if (!shouldLoad()) return;
  const mod = await loadSentry();
  if (!mod || initialized) return;
  try {
    mod.init({
      dsn: import.meta.env.VITE_SENTRY_DSN as string,
      environment: "production",
      tracesSampleRate: 0.1,
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

// Module-level guard — patching console.error twice would create infinite
// recursion (forwarder calls captureException which calls Sentry which may
// call console.error on its own failure path).
let consoleErrorPatched = false;
function installConsoleErrorForwarder(): void {
  if (consoleErrorPatched) return;
  consoleErrorPatched = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
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
    original(...args);
  };
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** Thin wrapper used by new code. Same shape as console.error but explicit. */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  captureException(err, context);
}

export function captureException(err: unknown, context?: Record<string, unknown>) {
  if (!shouldLoad()) return;
  loadSentry().then((mod) => {
    if (!mod || !initialized) return;
    try {
      mod.captureException(err, context ? { extra: context } : undefined);
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