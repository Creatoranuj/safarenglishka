// Safar English Ka - Entry Point

// ── Admin Eruda early-boot + console buffer ────────────────────────
// True frog-eye view: BEFORE any other import emits logs (crashShield,
// sentry, nativeDebug, web-vitals), we (1) buffer every console.* call
// and (2) kick off Eruda's dynamic import. When Eruda's init resolves,
// we re-emit the buffered entries so they appear in the in-app panel.
// Gated on a localStorage flag that AdminEruda.tsx writes after auth
// resolves admin = true. Non-admins never trigger this path.
try {
  if (typeof window !== "undefined" && localStorage.getItem("nb_admin_eruda") === "1") {
    type LogEntry = { level: "log" | "info" | "warn" | "error" | "debug"; args: unknown[]; t: number };
    const buffer: LogEntry[] = [];
    const MAX_BUFFER = 500;
    const levels: LogEntry["level"][] = ["log", "info", "warn", "error", "debug"];
    const original: Partial<Record<LogEntry["level"], (...a: unknown[]) => void>> = {};
    levels.forEach((lvl) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      original[lvl] = (console as any)[lvl]?.bind(console);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (console as any)[lvl] = (...args: unknown[]) => {
        if (buffer.length < MAX_BUFFER) buffer.push({ level: lvl, args, t: Date.now() });
        original[lvl]?.(...args);
      };
    });
    (window as unknown as { __nb_eruda_buffer?: LogEntry[] }).__nb_eruda_buffer = buffer;

    import("eruda").then(({ default: eruda }) => {
      try {
        if (!(window as unknown as { __nb_eruda_loaded?: boolean }).__nb_eruda_loaded) {
          eruda.init();
          (window as unknown as { __nb_eruda_loaded?: boolean }).__nb_eruda_loaded = true;
          // Replay buffered entries so admin sees pre-init boot logs.
          original.log?.(`[admin] Eruda early-boot loaded — replaying ${buffer.length} buffered log(s).`);
          buffer.forEach((e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            original[e.level]?.(`[t+${e.t}]`, ...e.args);
          });
        }
      } catch { /* noop */ }
    }).catch(() => { /* noop */ });
  }
} catch { /* noop */ }



import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initNativeDebug } from "./lib/nativeDebug";

// Synchronous: needed before any other code so native console.log works.
initNativeDebug();

// Eruda — legacy QA flag path. Kept for non-admin QA builds that ship
// with VITE_ENABLE_ERUDA=true. Admin-gated path lives in AdminEruda.tsx
// + the early-boot block at the top of this file.
if (import.meta.env.VITE_ENABLE_ERUDA === "true") {
  import("eruda").then(({ default: eruda }) => {
    try {
      if (!(window as unknown as { __nb_eruda_loaded?: boolean }).__nb_eruda_loaded) {
        eruda.init();
        (window as unknown as { __nb_eruda_loaded?: boolean }).__nb_eruda_loaded = true;
      }
      const btn = document.querySelector(".eruda-entry-btn") as HTMLElement | null;
      if (btn) btn.setAttribute("aria-label", "QA DevTools");
      // eslint-disable-next-line no-console
      console.log("[QA] Eruda DevTools loaded — tap the floating button.");
    } catch { /* noop */ }
  }).catch(() => { /* noop */ });
}

// Crash shield — heartbeat watchdog + global rejection trap + resume guard.
// Auto-reloads (cooldown-throttled) when the WebView freezes or its JS
// context is reaped after long backgrounding. Fixes "app stuck, touch not
// working" issue without needing the user to force-close.
import("./lib/crashShield").then((m) => m.initCrashShield()).catch(() => {});

// Boot watchdog — if the root never paints in 12s (white-screen freeze on
// low-RAM Android before React mounts), force a one-shot reload. Guarded
// by sessionStorage so we never enter a loop.
const BOOT_KEY = "nb_boot_watchdog_at";
try {
  const last = Number(sessionStorage.getItem(BOOT_KEY) || "0");
  if (Date.now() - last > 60_000) {
    const bootTimer = window.setTimeout(() => {
      const root = document.getElementById("root");
      const painted = !!root && root.childElementCount > 0;
      if (!painted) {
        try { sessionStorage.setItem(BOOT_KEY, String(Date.now())); } catch { /* noop */ }
        try { window.location.reload(); } catch { /* noop */ }
      }
    }, 12_000);
    // Cancel once React has actually mounted something.
    queueMicrotask(() => {
      const observer = new MutationObserver(() => {
        const root = document.getElementById("root");
        if (root && root.childElementCount > 0) {
          window.clearTimeout(bootTimer);
          observer.disconnect();
          // Self-heal: clear the boot guard on successful paint so a future
          // cold-start within 60s (OEM kill + reopen) is not permanently
          // suppressed from triggering the watchdog. (Audit fix)
          try { sessionStorage.removeItem(BOOT_KEY); } catch { /* noop */ }
        }
      });
      const root = document.getElementById("root");
      if (root) observer.observe(root, { childList: true });
    });
  }
} catch { /* noop */ }

// Render IMMEDIATELY — nothing else blocks the first paint.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Defer ALL non-critical boot work until the browser is idle. This frees the
// main thread for React's first paint, eliminating the cold-start white screen.
type IdleCb = (cb: () => void) => void;
const idle: IdleCb =
  typeof (window as unknown as { requestIdleCallback?: IdleCb }).requestIdleCallback === "function"
    ? (window as unknown as { requestIdleCallback: IdleCb }).requestIdleCallback
    : (cb) => setTimeout(cb, 0);

// Module-scope guard so the sentry global listeners are installed AT MOST
// once across HMR / double-import (was leaking a duplicate stack on every
// reload alongside useResumeRecovery + crashShield).
let __nb_sentry_listeners_installed = false;

idle(() => {
  // Sentry wrapper + SDK stay fully outside the app shell. The wrapper then
  // dynamically imports @sentry/react only in prod with a DSN.
  import("./lib/sentry").then((m) => {
    void m.initSentry();
    if (__nb_sentry_listeners_installed) return;
    __nb_sentry_listeners_installed = true;
    // OBS hardening — pipe browser-level unhandled errors through the
    // wrapper. Stays a no-op in dev / when VITE_SENTRY_DSN is unset.
    window.addEventListener("error", (e) => {
      m.captureException(e.error ?? e.message, { source: "window.onerror" });
    });
    window.addEventListener("unhandledrejection", (e) => {
      m.captureException(e.reason, { source: "unhandledrejection" });
    });
  }).catch(() => {});
  import("./lib/androidImmersive").then((m) => m.installImmersiveAutoToggle()).catch(() => {});
  // Capgo OTA updater removed — paid SaaS not used. Updates ship via Play Store APK.
  import("./lib/registerSW").then((m) => m.registerServiceWorker()).catch(() => {});
  import("./lib/native/security").then((m) => m.checkDeviceIntegrity()).catch(() => {});
  // Web Vitals + long-task logger (skill #6 — perf observability).
  import("./lib/perf/webVitals").then((m) => m.initWebVitals()).catch(() => {});
  // Ask the OS to mark our storage as persistent so downloaded PDFs aren't
  // silently evicted under memory pressure. Risk accepted by product owner —
  // manual cleanup UI lives in StorageManagerSheet.
  import("./lib/persistentStorage").then((m) => void m.requestPersistentStorage()).catch(() => {});
  // NOTE: keyboard inset tracker (--nb-keyboard-h) is initialised inside
  // initNativeChrome() in App.tsx — do NOT register it again here or
  // listeners fire twice on every keyboard event.
});
