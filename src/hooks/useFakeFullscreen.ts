import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Unified fullscreen helper for video players inside Capacitor's Android WebView.
 *
 * Why: `document.requestFullscreen()` on a <div> can reject silently on Android
 * WebView (only <video> triggers onShowCustomView). Without reconciliation,
 * React state drifts out of sync with reality → blank/frozen screens.
 *
 * This hook:
 *  - Fires native requestFullscreen WITHOUT await — preserves user-gesture
 *    context so Android WebView doesn't silently reject.
 *  - Uses a class on <body> (`nb-scroll-lock`) for scroll-lock so it can never
 *    leak (central cleanup removes it on every exit signal).
 *  - Reconciles state with `fullscreenchange` + `visibilitychange` + `popstate`.
 *  - Pushes a `playerFullscreen` history entry so the Android back button can
 *    exit fullscreen first (handled in useAndroidBackButton).
 */
export const useFakeFullscreen = (
  elementRef: React.RefObject<HTMLElement | null>,
  opts?: { onExit?: () => void }
) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const onExitRef = useRef(opts?.onExit);
  onExitRef.current = opts?.onExit;

  const enter = useCallback(() => {
    setIsFullscreen(true);
    document.body.classList.add("nb-scroll-lock");
    try { window.history.pushState({ playerFullscreen: true }, ""); } catch {}
    // Fire-and-forget — never await inside a gesture handler.
    try {
      const el = (elementRef.current ?? document.documentElement) as any;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
      req?.call(el)?.catch?.(() => {});
    } catch {
      /* pseudo-fullscreen fallback active */
    }
  }, [elementRef]);

  const exit = useCallback(() => {
    setIsFullscreen(false);
    document.body.classList.remove("nb-scroll-lock");
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch {}
    if (window.history.state?.playerFullscreen) {
      try { window.history.back(); } catch {}
    }
    onExitRef.current?.();
  }, []);

  const toggle = useCallback(() => {
    if (isFullscreen) exit();
    else enter();
  }, [isFullscreen, enter, exit]);

  // Reconcile React state with reality + bulletproof cleanup on every exit signal.
  useEffect(() => {
    const release = () => {
      document.body.classList.remove("nb-scroll-lock");
      setIsFullscreen((cur) => {
        if (cur) onExitRef.current?.();
        return false;
      });
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) release();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") release();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as any);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as any);
      document.removeEventListener("visibilitychange", onVisibility);
      // Safety: never leave body locked on unmount.
      document.body.classList.remove("nb-scroll-lock");
    };
  }, []);

  return { isFullscreen, enter, exit, toggle };
};
