/**
 * Lightweight performance instrumentation for freeze/latency debugging.
 *
 * Uses the browser's `performance.mark` / `performance.measure` API so
 * Chrome DevTools Performance panel + WebView tracing pick it up natively.
 * Also emits a Sentry breadcrumb + logs slow spans to the console in dev,
 * so we can spot regressions without a full Sentry Performance license.
 *
 * Usage:
 *   import { mark, measure } from "@/lib/perf/marks";
 *   mark("dashboard:mount");
 *   // …work…
 *   measure("dashboard:ready", "dashboard:mount"); // ms since mount
 *
 * Zero-cost on cold path: no listeners, no timers, no allocations when
 * disabled. Safe on native (Capacitor WebView supports the Performance API).
 */
import { addBreadcrumb } from "@/lib/sentry";

// Anything slower than this gets a warn-level breadcrumb + dev console log.
// Tune per surface if needed; 400ms is a good "user notices a hiccup" line.
const SLOW_MS = 400;

/** Emit a performance mark and record a Sentry breadcrumb. */
export function mark(name: string, data?: Record<string, unknown>): void {
  try {
    performance.mark(name);
  } catch {
    /* ignore — Safari can throw on duplicate names */
  }
  addBreadcrumb("perf", `mark:${name}`, data);
}

/**
 * Measure between a start mark and now. Returns duration in ms (or NaN if
 * the start mark is missing). Emits a breadcrumb with the duration and
 * warns in dev when the span exceeds `SLOW_MS`.
 */
export function measure(
  name: string,
  startMark: string,
  data?: Record<string, unknown>,
): number {
  let ms = NaN;
  try {
    const entry = performance.measure(name, startMark);
    ms = entry?.duration ?? NaN;
  } catch {
    return NaN;
  }
  const rounded = Math.round(ms);
  addBreadcrumb("perf", `measure:${name}`, { ms: rounded, ...data });
  if (import.meta.env.DEV && ms > SLOW_MS) {
    try {
      console.warn(`[perf] SLOW ${name}: ${rounded}ms`, data ?? "");
    } catch {
      /* ignore */
    }
  }
  return ms;
}

/** Convenience wrapper: time an async function end-to-end. */
export async function timed<T>(
  name: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const start = `${name}:start`;
  mark(start);
  try {
    return await fn();
  } finally {
    measure(name, start);
  }
}
