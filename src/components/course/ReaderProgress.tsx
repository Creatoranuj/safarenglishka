import { memo, useEffect, useRef, useState } from "react";
import { SpokeSpinner } from "../ui/spoke-spinner";

interface Props {
  /** When false, the overlay unmounts immediately. */
  visible: boolean;
  /** Title shown in the placeholder card. */
  title?: string;
  /**
   * Hint for the simulated curve when we have no real bytes yet.
   * - "pdf"   → canvas FastPdfReader path (real `pdf-progress` events arrive)
   * - "drive" → Google Drive iframe (no progress events possible — cross-origin)
   * - "notion"→ Notion edge proxy (single JSON fetch)
   * - "generic" → fallback
   */
  variant?: "pdf" | "drive" | "notion" | "generic";
}

/**
 * Blocking overlay for reader loads.
 *
 * UX rules (per user feedback):
 * - Never show a spinner alone → always pair with a status line.
 * - When real `pdf-progress` events arrive, show the numeric percent
 *   instead of the generic "Opening from Google Drive…" copy.
 * - For sources that can't report progress (Drive iframe, Notion proxy),
 *   fall back to a simulated determinate curve so the user still sees a
 *   moving number instead of a "silent" spinner.
 */
const ReaderProgress = memo(({ visible, title, variant = "pdf" }: Props) => {
  const [fadingOut, setFadingOut] = useState(false);
  const [percent, setPercent] = useState<number>(0);
  const simTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      setPercent(0);
      return;
    }

    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ percent?: number }>).detail;
      const p = detail?.percent;
      if (typeof p === "number" && p >= 0) {
        setPercent((prev) => Math.max(prev, Math.min(99, Math.round(p))));
      }
    };
    const onReady = () => {
      setPercent(100);
      setFadingOut(true);
    };

    window.addEventListener("pdf-progress", onProgress as EventListener);
    window.addEventListener("pdf-ready", onReady);

    // Simulated progress for sources without real byte events (Drive/Notion/iframe).
    // Ease toward 90% over ~8s so the number always advances.
    if (variant !== "pdf") {
      const start = Date.now();
      simTimerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        // 1 - e^(-t/3) curve, capped at 90 to leave room for real ready event.
        const eased = Math.round((1 - Math.exp(-elapsed / 3)) * 90);
        setPercent((prev) => Math.max(prev, eased));
      }, 200);
    }

    return () => {
      window.removeEventListener("pdf-progress", onProgress as EventListener);
      window.removeEventListener("pdf-ready", onReady);
      if (simTimerRef.current) {
        window.clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    };
  }, [visible, variant]);

  if (!visible && !fadingOut) return null;

  const baseLabel = title ? `Opening ${title}` : "Opening document";
  const label = percent > 0 ? `${baseLabel} — ${percent}%` : `${baseLabel}…`;

  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background transition-opacity duration-300 ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      onTransitionEnd={() => {
        if (fadingOut) setFadingOut(false);
      }}
    >
      <SpokeSpinner />
      <p className="text-sm text-muted-foreground text-center px-6 max-w-xs tabular-nums">
        {label}
      </p>
      {/* Determinate bar — collapses to 0 width until the first tick,
          then always animates so users see the load moving. */}
      <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
});

ReaderProgress.displayName = "ReaderProgress";
export default ReaderProgress;
