// Safar English - Entry Point

// Install this synchronously before CrashShield, Sentry, React, or
// pdf.js can load. pdf.js/React-PDF intentionally abort in-flight workers when
// the user closes a PDF or when we switch from streaming → byte fallback; on
// Android WebView/Firefox that lifecycle cancellation surfaces as an
// `unhandledrejection` (`AbortError: The operation was aborted.`). It is not a
// crash and must never reach Sentry or trigger reload logic.
const NB_EXPECTED_ABORT_RE = /AbortError|AbortException|aborted a request|operation was aborted|worker was terminated|\baborted\b/i;
try {
  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason as { name?: string; message?: string } | string | null | undefined;
      const name = typeof reason === "object" && reason ? reason.name || "" : "";
      const message = typeof reason === "object" && reason ? reason.message || "" : String(reason || "");
      if (NB_EXPECTED_ABORT_RE.test(`${name} ${message}`)) {
        event.preventDefault();
      }
    },
    { capture: true },
  );
} catch { /* noop */ }

// ── Lovable-preview iframe noise suppression ───────────────────────
// The Lovable preview harness posts window messages (e.g. SET_SAFE_AREA)
// that our app doesn't handle, which the harness then logs as
// `console.warn("Unknown message type: <TYPE>")`. Only observed inside
// the Lovable preview iframe — never in prod APK / web build. Mute the
// exact string so Sentry breadcrumb triage stays clean.
// See: mem://index.md — signal-only, do not broaden.
try {
  if (typeof window !== "undefined") {
    const PREVIEW_NOISE_RE = /^Unknown message type:\s*(SET_SAFE_AREA|SET_KEYBOARD|SET_STATUS_BAR)\b/;
    for (const method of ["warn", "log", "info", "error"] as const) {
      const orig = (console[method] as (...a: unknown[]) => void).bind(console);
      // eslint-disable-next-line no-console
      console[method] = (...args: unknown[]) => {
        try {
          const first = typeof args[0] === "string" ? (args[0] as string) : "";
          if (PREVIEW_NOISE_RE.test(first)) return;
        } catch { /* fall through */ }
        orig(...args);
      };
    }
  }
} catch { /* noop */ }

// NOTE: the admin Eruda in-app DevTools overlay (and its early-boot console
// buffer) was removed on request — the floating debug button must never
// appear in the shipped app. Do not re-add.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// Rebrand fonts — Libre Baskerville (serif) + IBM Plex Sans (body).
import "@fontsource/libre-baskerville/400.css";
import "@fontsource/libre-baskerville/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./index.css";
import { initNativeDebug } from "./lib/nativeDebug";
import { logger } from "@/lib/logger";

// Synchronous: needed before any other code so native console.log works.
initNativeDebug();

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
    // RELY fix (LTP3 MED): attach the MutationObserver FIRST, then start the
    // 12s reload timer. Prior order set the timer before the observer, so on
    // mid-tier Android where hydration takes 10-12s the observer could miss
    // the first paint and the watchdog would force-reload a healthy boot.
    let bootTimer: number | undefined;
    const cancel = () => {
      if (bootTimer !== undefined) {
        window.clearTimeout(bootTimer);
        bootTimer = undefined;
      }
      try { sessionStorage.removeItem(BOOT_KEY); } catch { /* noop */ }
    };
    const root = document.getElementById("root");
    const observer = new MutationObserver(() => {
      const r = document.getElementById("root");
      if (r && r.childElementCount > 0) {
        cancel();
        observer.disconnect();
      }
    });
    if (root) observer.observe(root, { childList: true });
    // Also cancel on first animation frame if paint already happened — belt
    // and suspenders for the case where React mounted before this ran.
    requestAnimationFrame(() => {
      const r = document.getElementById("root");
      if (r && r.childElementCount > 0) { cancel(); observer.disconnect(); }
    });
    bootTimer = window.setTimeout(() => {
      const r = document.getElementById("root");
      const painted = !!r && r.childElementCount > 0;
      if (!painted) {
        try { sessionStorage.setItem(BOOT_KEY, String(Date.now())); } catch { /* noop */ }
        try { window.location.reload(); } catch { /* noop */ }
      }
    }, 12_000);
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

// (Removed __nb_sentry_listeners_installed — no listeners are registered here
// anymore; nativeDebug owns the single capture-phase source.)



idle(() => {
  // Sentry wrapper + SDK stay fully outside the app shell. The wrapper then
  // dynamically imports @sentry/react only in prod with a DSN.
  //
  // OBS fix (LTP3 HIGH): the previous window.error / unhandledrejection
  // listeners registered here were REDUNDANT. `nativeDebug.initNativeDebug()`
  // already installs capture-phase listeners that filter noise and re-emit
  // real errors through `console.error`, which the Sentry
  // `installConsoleErrorForwarder` (invoked from `initSentry`) forwards to
  // Sentry. Registering them again in the bubble phase caused every real
  // error to be reported to Sentry twice. Removed — single-source pipeline
  // is: window event → nativeDebug (capture) → console.error → Sentry.
  import("./lib/sentry").then((m) => { void m.initSentry(); }).catch(() => {});
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
  // Screen protection baseline: force FLAG_SECURE OFF at boot so students
  // can screenshot everywhere EXCEPT LessonView (the only opt-in surface).
  // Without this, any residual native flag from a warm start would trap
  // students on Profile/Courses/Books/Downloads. Admin bypass is unchanged.
  import("./hooks/useScreenProtection").then((m) => m.bootstrapScreenProtection()).catch(() => {});
});

