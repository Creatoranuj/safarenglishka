/**
 * Idle-time route prefetcher.
 *
 * Owns all `import()`-based warmups so individual call sites don't sprinkle
 * `requestIdleCallback` boilerplate. Routes are classified as:
 *
 *   Hot   — eagerly bundled in App.tsx (Index, Login, Profile, Downloads).
 *   Warm  — lazy chunks the user is likely to visit within their first
 *           session. Prefetched here once the main thread goes idle so the
 *           navigation feels instant. Network is best-effort: failures are
 *           swallowed (a real navigation will retry via lazyWithRetry).
 *   Cold  — admin / rarely-visited routes. NOT prefetched.
 *
 * Update the WARM_ROUTES array when adding a frequently-used route.
 */
type IdleHandle = number;
type IdleCb = (deadline?: { didTimeout: boolean; timeRemaining: () => number }) => void;

const idle = (cb: IdleCb, timeout = 2500): IdleHandle => {
  const w = window as typeof window & {
    requestIdleCallback?: (cb: IdleCb, opts?: { timeout: number }) => IdleHandle;
  };
  if (w.requestIdleCallback) return w.requestIdleCallback(cb, { timeout });
  return window.setTimeout(() => cb(), 1200);
};

// Warm routes — student-facing, frequently hit. Order = likely visit order.
const WARM_ROUTES: Array<() => Promise<unknown>> = [
  () => import("../pages/Dashboard"),
  () => import("../pages/MyCourses"),
  () => import("../pages/Courses"),
  () => import("../pages/Materials"),
  () => import("../pages/Notices"),
  () => import("../pages/Timetable"),
  () => import("../pages/AllClasses"),
  () => import("../pages/LectureListing"),
];

let started = false;

/**
 * Kick off idle prefetching. Safe to call multiple times — only runs once
 * per page load. Call after first paint + appReady.
 *
 * @param isAuthenticated  When false, prefetch is a no-op. Every WARM_ROUTE
 *   is an authed page, so prefetching them for anonymous visitors on the
 *   landing page wastes ~150–250 KB of mobile bandwidth before they ever
 *   sign in. Gating by auth state keeps the landing payload minimal.
 */
export function startIdlePrefetch(isAuthenticated = true): void {
  if (started || typeof window === "undefined") return;
  if (!isAuthenticated) return; // anonymous visitors don't need authed chunks
  started = true;

  // Stagger imports so we never saturate the network or the main thread.
  // Each chunk waits for the previous to settle, then yields back to idle.
  let i = 0;
  const next = () => {
    if (i >= WARM_ROUTES.length) return;
    const load = WARM_ROUTES[i++];
    idle(() => {
      load()
        .catch(() => { /* lazyWithRetry will handle real navigations */ })
        .finally(next);
    });
  };
  // First tick — wait a beat so we don't fight the initial route's chunk.
  idle(next, 4000);
}
