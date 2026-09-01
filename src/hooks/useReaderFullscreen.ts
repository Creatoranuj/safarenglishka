import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { isNative } from "@/lib/platform";
import { suppressCrashShield } from "@/lib/crashShield";
import { noteUserAction, recordDiagnostic } from "@/lib/freezeDiagnostics";

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

const isDocFullscreen = () => {
  const doc = document as FullscreenDocument;
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
};

/**
 * One fullscreen state machine for all PDF shells.
 * Native readers are already edge-to-edge, so toggling only hides app chrome;
 * the PDF subtree is never reparented or remounted.
 */
export function useReaderFullscreen(rootRef: RefObject<HTMLElement | null>) {
  const native = isNative();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const transitionRef = useRef(false);
  const mountedRef = useRef(true);
  const toggleRef = useRef<(retry?: boolean) => Promise<void>>(async () => {});

  const relayoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    mountedRef.current = false;
    if (relayoutRef.current !== null) window.clearTimeout(relayoutRef.current);
  }, []);

  /**
   * Dispatching `resize` in the same frame as the flag flip forces every
   * mounted PDF canvas to re-measure and re-rasterise synchronously — that is
   * the multi-second freeze on low-RAM devices. Debounce it onto an idle frame
   * so React commits the new layout first and only one relayout runs even when
   * fullscreen is toggled repeatedly.
   */
  const scheduleRelayout = useCallback(() => {
    if (relayoutRef.current !== null) window.clearTimeout(relayoutRef.current);
    relayoutRef.current = window.setTimeout(() => {
      relayoutRef.current = null;
      if (!mountedRef.current) return;
      const fire = () => window.dispatchEvent(new Event("resize"));
      const ric = (window as unknown as {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      }).requestIdleCallback;
      if (typeof ric === "function") ric(fire, { timeout: 300 });
      else requestAnimationFrame(fire);
    }, 120);
  }, []);

  useEffect(() => {
    if (native) return;
    const sync = () => {
      if (mountedRef.current) setIsFullscreen(isDocFullscreen());
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync as EventListener);
      try {
        if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      } catch {
        // Reader teardown must remain synchronous and safe.
      }
    };
  }, [native]);

  const runToggle = useCallback(async (isRetry = false) => {
    if (transitionRef.current) return;
    transitionRef.current = true;
    // The toggle itself is cheap; the re-layout it triggers is not. Cover the
    // whole transition (flag flip → React commit → deferred relayout) so the
    // heartbeat watchdog can't read a heavy PDF re-rasterise as a frozen main
    // thread and hard-reload the app mid-transition.
    suppressCrashShield(8_000);
    noteUserAction(isRetry ? "fullscreen retry" : "fullscreen toggle");
    try {
      if (native) {
        if (mountedRef.current) setIsFullscreen((value) => !value);
        scheduleRelayout();
        return;
      }

      const doc = document as FullscreenDocument;
      if (isDocFullscreen()) {
        const result = document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.();
        await Promise.resolve(result);
      } else {
        const element = (rootRef.current ?? document.documentElement) as FullscreenElement;
        const request = element.requestFullscreen ?? element.webkitRequestFullscreen ?? element.mozRequestFullScreen;
        if (!request) throw new Error("Fullscreen API unsupported in this WebView");
        await Promise.resolve(request.call(element));
      }
      // Promise settled — take the browser's word, not our optimistic guess.
      if (mountedRef.current) setIsFullscreen(isDocFullscreen());
      scheduleRelayout();
    } catch (error) {
      if (mountedRef.current) setIsFullscreen(isDocFullscreen());
      recordDiagnostic("fullscreen", "Fullscreen toggle failed", error);
      if (isRetry) {
        toast.error("Fullscreen abhi bhi nahi khula — phone ka rotate/auto-rotate use karo.");
      } else {
        toast.error("Fullscreen nahi khul paaya.", {
          action: {
            label: "Retry",
            onClick: () => { void toggleRef.current(true); },
          },
        });
      }
    } finally {
      window.setTimeout(() => { transitionRef.current = false; }, 350);
    }
  }, [native, rootRef, scheduleRelayout]);

  toggleRef.current = runToggle;

  const toggleFullscreen = useCallback(() => runToggle(false), [runToggle]);

  return { isFullscreen, toggleFullscreen, isNativeFullscreen: native };
}
