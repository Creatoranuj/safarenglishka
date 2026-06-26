// Crash Shield — prevents WebView freeze / unresponsive UI from killing the app.
//
// Three layers of protection:
//   1. Heartbeat watchdog — if the main thread is blocked > 10s, reload.
//   2. Global unhandled-rejection trap — prevents the WebView context from
//      being torn down by Android when too many uncaught errors accumulate.
//   3. Visibility-resume guard — when user returns to a backgrounded app
//      whose JS context was killed, force a fresh reload instead of showing
//      a frozen/blank screen.
//
// Reload throttling uses sessionStorage so we NEVER enter an infinite reload
// loop — at most 1 auto-reload per 60s session window.

const RELOAD_KEY = "nb_crash_reload_at";
const RELOAD_COOLDOWN_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 2_000;
const HEARTBEAT_FREEZE_THRESHOLD_MS = 10_000;

function canReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    return Date.now() - last > RELOAD_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function safeReload(reason: string) {
  if (!canReload()) {
    console.warn("[crashShield] reload suppressed (cooldown):", reason);
    // Audit fix: reset rejectionCount so a single fresh rejection after
    // the cooldown branch doesn't immediately re-trigger the (suppressed)
    // reload path on every event, spamming the log.
    rejectionCount = 0;
    rejectionWindowStart = Date.now();
    return;
  }
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* noop */ }
  console.warn("[crashShield] auto-reloading:", reason);
  try {
    window.location.reload();
  } catch { /* noop */ }
}

/** Heartbeat — a worker-like setTimeout chain. If the gap between ticks
 *  exceeds the freeze threshold, the main thread was blocked → reload.
 *
 *  IMPORTANT: setTimeout is heavily throttled when the tab/WebView is
 *  hidden (Android backgrounding, browser tab switch, OS doze). A long
 *  gap there is NOT a freeze — it's just throttling. We must:
 *   1. Skip detection while document.hidden was true at any point in the gap.
 *   2. Reset lastTick whenever visibility returns, so the first post-resume
 *      tick doesn't see a stale baseline.
 */
let heartbeatLastTick = Date.now();
let heartbeatSuppressUntil = 0;

function startHeartbeat() {
  heartbeatLastTick = Date.now();
  const tick = () => {
    const now = Date.now();
    const gap = now - heartbeatLastTick;
    heartbeatLastTick = now;
    const hidden = typeof document !== "undefined" && document.hidden;
    if (hidden || now < heartbeatSuppressUntil) {
      setTimeout(tick, HEARTBEAT_INTERVAL_MS);
      return;
    }
    if (gap > HEARTBEAT_FREEZE_THRESHOLD_MS) {
      safeReload(`main-thread frozen ${gap}ms`);
      return;
    }
    setTimeout(tick, HEARTBEAT_INTERVAL_MS);
  };
  setTimeout(tick, HEARTBEAT_INTERVAL_MS);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        // Throw away the throttled gap and give the page a grace period
        // before the watchdog is allowed to fire again.
        heartbeatLastTick = Date.now();
        heartbeatSuppressUntil = Date.now() + 5_000;
      }
    });
  }
}

let rejectionCount = 0;
// Raised from 8 → 15 and window narrowed 15s → 10s. On offline cold start
// React Query + Supabase realtime can legitimately fire 8+ rejections within
// 15s, which used to trigger an emergency reload loop with no actual crash.
const REJECTION_THRESHOLD = 15;
const REJECTION_WINDOW_MS = 10_000;
let rejectionWindowStart = Date.now();

// Patterns we treat as "expected" — they should NOT count toward the
// emergency-reload threshold. Network / auth / abort errors are routine on
// flaky mobile data; only genuinely unexpected rejections indicate a crash.
// C2: websocket pattern narrowed — broad /websocket/i was masking Realtime
// logic errors. We only silence true connection-layer noise (HMR + Realtime
// reconnects), not application-level WebSocket exceptions.
// Audit fix: added `UNIMPLEMENTED|not implemented` — Capacitor plugin proxies
// reject with this code on platforms that don't implement a method (e.g. web,
// or Android pre-plugin-install). These are routine and already handled by the
// caller; they should NOT count toward the emergency-reload threshold.
const EXPECTED_REJECTION_RE =
  /network|fetch|offline|failed to fetch|aborted|abort|timeout|timed out|401|403|cancell?ed|websocket (connection failed|closed without opened|is closed|disconnect)|HMR|UNIMPLEMENTED|not implemented/i;

function installGlobalTraps() {
  window.addEventListener("unhandledrejection", (e) => {
    let msg = "";
    try {
      msg = String(
        (e.reason as { message?: string } | null)?.message ?? e.reason ?? ""
      );
    } catch { msg = ""; }
    // Silence expected rejections so they don't count toward the threshold,
    // but still preventDefault so the WebView doesn't log them as fatal.
    if (EXPECTED_REJECTION_RE.test(msg)) {
      try { e.preventDefault(); } catch { /* noop */ }
      return;
    }
    const now = Date.now();
    if (now - rejectionWindowStart > REJECTION_WINDOW_MS) {
      rejectionWindowStart = now;
      rejectionCount = 0;
    }
    rejectionCount += 1;
    console.error("[crashShield] unhandledrejection", e.reason);
    try { e.preventDefault(); } catch { /* noop */ }
    if (rejectionCount >= REJECTION_THRESHOLD) {
      safeReload(`${rejectionCount} unhandled rejections in ${REJECTION_WINDOW_MS / 1000}s`);
    }
  });

  window.addEventListener("error", (e) => {
    // Chunk-load errors — most often after a deploy. Force reload to grab
    // the new index.html (only once per cooldown window).
    const msg = String(e.message || "");
    if (/Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError/i.test(msg)) {
      safeReload(`chunk load failed: ${msg.slice(0, 80)}`);
    }
  });
}

/** Listen for Android lowMemory + memorywarning, dump caches BEFORE the
 *  OS kills the WebView. This is the last line of defence against OOM. */
function installMemoryPressureHandler() {
  const trim = () => {
    console.warn("[crashShield] memory pressure → trimming caches");
    try { sessionStorage.removeItem("nb_query_cache_v1"); } catch { /* noop */ }
    try { localStorage.removeItem("nb_query_cache_v1"); } catch { /* noop */ }
    // Best-effort: revoke any tracked blob URLs.
    try {
      const tracked = (window as unknown as { __nb_blob_urls?: Set<string> }).__nb_blob_urls;
      tracked?.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* noop */ } });
      tracked?.clear();
    } catch { /* noop */ }
  };
  // Capacitor App plugin emits `appStateChange` but not lowMemory directly;
  // on Android we can hook the global `memorywarning` event our native shim
  // dispatches, and on iOS WKWebView dispatches `memorywarning` natively.
  window.addEventListener("memorywarning", trim);
  // Fallback: when the page is hidden, opportunistically trim.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // Light trim only — keep query cache, just drop revoked blobs.
      try {
        const tracked = (window as unknown as { __nb_blob_urls?: Set<string> }).__nb_blob_urls;
        tracked?.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* noop */ } });
        tracked?.clear();
      } catch { /* noop */ }
    }
  });
}

// NOTE: installResumeGuard() was REMOVED. It duplicated stale-background
// detection that useResumeRecovery already performs with a shorter, more
// aggressive 10-min threshold. Running BOTH caused the two systems to consume
// their independent one-shot reload guards simultaneously on long backgrounds,
// permanently disabling auto-recovery. useResumeRecovery is now the single
// source of truth for stale-bg reloads.

let installed = false;
export function initCrashShield(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  try {
    installGlobalTraps();
    installMemoryPressureHandler();
    // C3: Defer heartbeat until after first paint / idle so a slow cold boot
    // (heavy hydration on budget Android) is never misread as a "frozen main
    // thread" and force-reloaded mid-boot. requestIdleCallback falls back to
    // a 2s setTimeout where unsupported (Safari < 16.4).
    const startHB = () => {
      try { startHeartbeat(); } catch { /* noop */ }
    };
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (typeof ric === "function") {
      ric(startHB, { timeout: 5_000 });
    } else {
      setTimeout(startHB, 2_000);
    }
    console.log("[crashShield] installed (heartbeat + traps + memory)");
  } catch (err) {
    console.warn("[crashShield] install failed", err);
  }
}
