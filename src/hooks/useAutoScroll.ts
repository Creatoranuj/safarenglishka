import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { safeGet, safeSet } from "../lib/storage";

const SPEED_KEY = "nb_autoscroll_speed";

export interface AutoScrollOptions {
  /** DOM element to scroll (same-origin markdown / native scrollers). */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** Iframe element (cross-origin PDF/Doc viewers). Used as keystroke fallback. */
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
}

/**
 * Autoscroll engine.
 * - Single tap → toggle (caller wires `toggle()` to onClick).
 * - Long-press → caller opens speed picker, then calls `setSpeed(...)`.
 * - Persists chosen speed in localStorage.
 * - For same-origin scrollers we increment scrollTop on rAF.
 * - For cross-origin iframes we send periodic ArrowDown keydown events (best-effort).
 */
export function useAutoScroll({ targetRef, iframeRef }: AutoScrollOptions) {
  const [active, setActive] = useState(false);
  const [speed, _setSpeed] = useState<number>(() => {
    const s = parseFloat(safeGet(SPEED_KEY) || "");
    return Number.isFinite(s) && s > 0 ? s : 1;
  });
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  /** Float accumulator so sub-pixel speeds (0.1–0.5) aren't rounded away. */
  const accRef = useRef<number>(0);
  const iframeTickRef = useRef<number | null>(null);
  const msgHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const supportTimerRef = useRef<number | null>(null);

  const setSpeed = useCallback((s: number) => {
    const clamped = Math.max(0.1, Math.min(10, Math.round(s * 10) / 10));
    _setSpeed(clamped);
    safeSet(SPEED_KEY, String(clamped));
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (iframeTickRef.current != null) clearInterval(iframeTickRef.current);
    iframeTickRef.current = null;
    if (msgHandlerRef.current) {
      window.removeEventListener("message", msgHandlerRef.current);
      msgHandlerRef.current = null;
    }
    if (supportTimerRef.current != null) {
      window.clearTimeout(supportTimerRef.current);
      supportTimerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop();
    const el = targetRef?.current;
    if (el) {
      // Same-origin: smooth pixel scroll. speed = px per frame at 60fps baseline.
      // Use relative scrollBy + a float accumulator so:
      //  (a) sub-pixel speeds (0.1–0.5) still advance, and
      //  (b) manual finger/wheel scrolling adds on top instead of being overwritten.
      lastTsRef.current = 0;
      accRef.current = 0;
      // Smooth path: keep scrollTop as a float and let the browser sub-pixel
      // render. Falls back to scrollBy on engines that snap to integers.
      const step = (ts: number) => {
        if (!lastTsRef.current) lastTsRef.current = ts;
        const dt = Math.min(4, (ts - lastTsRef.current) / 16.67); // cap dt to avoid jumps after tab-away
        lastTsRef.current = ts;
        accRef.current += speed * dt;
        if (accRef.current >= 0.05) {
          const dy = accRef.current;
          accRef.current = 0;
          // Float scrollTop is honoured on modern browsers; keeps motion silky at 0.1–0.5x.
          el.scrollTop = el.scrollTop + dy;
        }
        const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if (atEnd) { setActive(false); stop(); return; }
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
      return;
    }
    const ifr = iframeRef?.current;
    if (ifr) {
      // PDF iframe path. For our self-hosted /pdfjs viewer, the page includes
      // nb-bridge.js which listens for { type: "nb-autoscroll-tick", dy }
      // messages and scrolls #viewerContainer. We ping first to detect
      // support; if no pong arrives within 1.2s we toast and stop.
      let supported = false;
      const handler = (e: MessageEvent) => {
        const d = e?.data;
        if (!d || typeof d !== "object") return;
        if (d.type === "nb-autoscroll-pong") {
          supported = true;
        } else if (d.type === "nb-autoscroll-state" && d.atEnd) {
          setActive(false);
          stop();
        }
      };
      msgHandlerRef.current = handler;
      window.addEventListener("message", handler);

      try { ifr.contentWindow?.postMessage({ type: "nb-autoscroll-ping" }, "*"); } catch { /* ignore */ }

      lastTsRef.current = 0;
      const tick = (ts: number) => {
        if (!lastTsRef.current) lastTsRef.current = ts;
        const dt = (ts - lastTsRef.current) / 16.67;
        lastTsRef.current = ts;
        try {
          ifr.contentWindow?.postMessage(
            { type: "nb-autoscroll-tick", dy: speed * dt },
            "*"
          );
        } catch { /* ignore */ }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      supportTimerRef.current = window.setTimeout(() => {
        if (!supported) {
          toast.info("Autoscroll sirf in-app PDFs pe chalta hai. Pehle My Library me save karo.");
          setActive(false);
          stop();
        }
      }, 1500);
    }
  }, [stop, targetRef, iframeRef, speed]);

  const toggle = useCallback(() => {
    setActive((v) => {
      const next = !v;
      if (next) start(); else stop();
      return next;
    });
  }, [start, stop]);

  // Restart engine if speed changes while active
  useEffect(() => { if (active) start(); /* eslint-disable-next-line */ }, [speed]);
  useEffect(() => () => stop(), [stop]);

  // ── Hold-on-content pause ──────────────────────────────────────────────
  // When autoscroll is active, a press-and-hold anywhere on the scrolled
  // content temporarily pauses scrolling (engine stop, state stays `active`).
  // Release → engine resumes at the same speed automatically.
  // Threshold of 140ms avoids interfering with normal taps / swipes.
  useEffect(() => {
    if (!active) return;
    const el = targetRef?.current;
    if (!el) return; // iframe case is handled inside the iframe bridge

    let holdTimer: number | null = null;
    let paused = false;
    let startY = 0;
    let startX = 0;

    const clearTimer = () => {
      if (holdTimer != null) { window.clearTimeout(holdTimer); holdTimer = null; }
    };
    const onDown = (e: TouchEvent | PointerEvent) => {
      const t = (e as TouchEvent).touches?.[0] ?? (e as PointerEvent);
      startX = t.clientX; startY = t.clientY;
      clearTimer();
      holdTimer = window.setTimeout(() => {
        paused = true;
        stop();
      }, 140);
    };
    const onMove = (e: TouchEvent | PointerEvent) => {
      if (paused) return;
      const t = (e as TouchEvent).touches?.[0] ?? (e as PointerEvent);
      if (Math.hypot(t.clientX - startX, t.clientY - startY) > 10) clearTimer();
    };
    const onUp = () => {
      clearTimer();
      if (paused) {
        paused = false;
        // Resume only if still flagged active (user didn't toggle off).
        start();
      }
    };

    el.addEventListener("touchstart", onDown, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onUp, { passive: true });
    el.addEventListener("touchcancel", onUp, { passive: true });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      clearTimer();
      el.removeEventListener("touchstart", onDown);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onUp);
      el.removeEventListener("touchcancel", onUp);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [active, targetRef, start, stop]);

  return { active, speed, setSpeed, toggle, pause: stop, resume: start };
}
