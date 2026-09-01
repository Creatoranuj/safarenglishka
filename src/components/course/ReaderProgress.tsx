import { memo, useEffect, useRef, useState } from "react";
import { SpokeSpinner } from "../ui/spoke-spinner";
import { pdfDisplayName } from "@/lib/pdfDisplayName";
import { getProgressFloor, raiseProgressFloor, resetProgressFloor } from "@/lib/readerProgressStore";
import { pdfLifecycleMatches } from "@/lib/pdfLifecycle";

interface Props {
  /** When false, the overlay unmounts immediately. */
  visible: boolean;
  /** Title shown in the placeholder card. */
  title?: string;
  /**
   * Stable identity of the document being opened (usually its URL). Used to
   * keep the percentage monotonic across internal retries/remounts of the
   * same document while still starting from 0% for a different document.
   */
  docKey?: string;
  /**
   * Hint for the simulated curve when we have no real bytes yet.
   * - "pdf"   → canvas FastPdfReader path (real `pdf-progress` events arrive)
   * - "drive" → Google Drive iframe (no progress events possible — cross-origin)
   * - "notion"→ Notion edge proxy (single JSON fetch)
   * - "generic" → fallback
   */
  variant?: "pdf" | "archive" | "drive" | "notion" | "generic";
  readerId?: string;
}

type ProgressPhase = "connecting" | "indexing" | "downloading" | "rendering" | "ready";

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
const ReaderProgress = memo(({ visible, title, docKey, variant = "pdf", readerId }: Props) => {
  const key = docKey || title || "reader";
  const [fadingOut, setFadingOut] = useState(false);
  const [percent, setPercent] = useState<number>(() => getProgressFloor(key));
  /** Simulated fallback percent — only displayed until real bytes arrive. */
  const [simPercent, setSimPercent] = useState<number>(0);
  const [measured, setMeasured] = useState(false);
  const [phase, setPhase] = useState<ProgressPhase>(variant === "archive" ? "connecting" : "downloading");
  const [indeterminate, setIndeterminate] = useState(false);
  /** No real bytes past the proxy's 8s archive resolve cap. */
  const [stalled, setStalled] = useState(false);

  const simTimerRef = useRef<number | null>(null);
  const measuredRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setPercent(getProgressFloor(key));
      setSimPercent(0);
      setMeasured(false);
      measuredRef.current = false;
      setPhase(variant === "archive" ? "connecting" : "downloading");
      setIndeterminate(false);
      setStalled(false);
      return;
    }
    measuredRef.current = false;
    setMeasured(false);
    setStalled(false);

    // Resume from the highest percent already shown for this document so an
    // internal retry or byte-fallback remount never rewinds the bar.
    setPercent(getProgressFloor(key));

    const onProgress = (e: Event) => {
      if (!pdfLifecycleMatches(e, readerId)) return;
      const detail = (e as CustomEvent<{ percent?: number; phase?: ProgressPhase }>).detail;
      const p = detail?.percent;
      if (detail?.phase) setPhase(detail.phase);
      if (typeof p === "number" && p >= 0) {
        setIndeterminate(false);
        setMeasured(true);
        measuredRef.current = true;
        setPercent(raiseProgressFloor(key, p));
      } else if (p === -1) {
        setIndeterminate(true);
      }
    };
    const onReady = (e: Event) => {
      if (!pdfLifecycleMatches(e, readerId)) return;
      setPercent(100);
      setMeasured(true);
      setPhase("ready");
      setIndeterminate(false);
      setFadingOut(true);
      resetProgressFloor();
    };

    window.addEventListener("pdf-progress", onProgress as EventListener);
    window.addEventListener("pdf-ready", onReady);

    // Simulated progress so a number is ALWAYS visible — never a silent
    // spinner. For iframe/proxy sources (Drive/Notion) no byte events exist
    // at all, so the curve eases to 90%. For the canvas PDF path real bytes
    // usually arrive within a second, so the curve is deliberately slow
    // (caps at 40%) and is discarded the moment a measured percent lands.
    const start = Date.now();
    const ceiling = variant === "archive" ? 12 : variant === "pdf" ? 40 : 90;
    const tau = variant === "archive" ? 4 : variant === "pdf" ? 6 : 3;
    simTimerRef.current = window.setInterval(() => {
      // Freeze the simulated curve as soon as real bytes arrive so the two
      // sources can never fight (and so `shown` can never step backwards).
      if (measuredRef.current) return;
      const elapsed = (Date.now() - start) / 1000;
      const eased = Math.round((1 - Math.exp(-elapsed / tau)) * ceiling);
      setSimPercent((prev) => Math.max(prev, eased));
      // The proxy caps its archive.org metadata resolve at 8s, so once we pass
      // that with no real bytes the number has stopped meaning anything —
      // say so instead of parking on a frozen percentage.
      if (elapsed > 9) setStalled(true);
    }, 200);


    return () => {
      window.removeEventListener("pdf-progress", onProgress as EventListener);
      window.removeEventListener("pdf-ready", onReady);
      if (simTimerRef.current) {
        window.clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    };
  }, [visible, variant, key, readerId]);

  if (!visible && !fadingOut) return null;

  // Monotonic by construction: we never *swap* from the simulated curve to the
  // (usually smaller) first measured percent — that swap was the visible
  // backwards jump. The simulated curve is frozen the moment real bytes land
  // and the shown value is the max of both, so it only ever climbs.
  const shown = Math.max(percent, simPercent);

  // Defensive: any caller that still passes a raw storage filename gets a
  // readable name here instead of leaking a hash to the student.
  const displayTitle = title ? pdfDisplayName(title, [title]) : "";
  const baseLabel = displayTitle && displayTitle !== "PDF Document"
    ? `Opening ${displayTitle}`
    : "Opening document";
  // Stalled first load (no measured bytes past the proxy's 8s archive cap):
  // stop showing a fake percentage and say what is actually happening.
  const stalledLabel = variant === "archive"
    ? "Archive.org is slow to respond — still trying"
    : "Server is slow to respond — still trying";
  const phaseLabel = stalled && !measured
    ? stalledLabel
    : phase === "connecting"
      ? "Connecting to Archive.org"
      : phase === "indexing"
        ? "Reading document index"
        : phase === "rendering"
          ? "Preparing first page"
          // "Reconnecting" is only truthful when bytes were already measured
          // and the stream then went unmeasurable (a retry). A first load with
          // no Content-Length is still just "Opening …".
          : indeterminate && measured && shown > 0
            ? "Reconnecting"
            : baseLabel;
  const label = stalled && !measured
    ? `${phaseLabel}…`
    : shown > 0 ? `${phaseLabel} — ${shown}%` : `${phaseLabel}…`;


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
      {/* Determinate bar — sized for touch-target legibility (Linear-style
          load indicator, 6px tall × 64 wide). A minimum 6% "seed" width
          keeps the primary color visible even at 0% so users can see the
          rail is real, not an empty placeholder. */}
      <div
        className="h-1.5 w-64 overflow-hidden rounded-full bg-border/70 ring-1 ring-border/50"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
      >
        <div
          className={`h-full bg-primary transition-[width] duration-300 ease-out ${indeterminate && !measured ? "motion-safe:animate-pulse" : ""}`}
          style={{ width: `${Math.max(shown, 6)}%` }}
        />
      </div>
    </div>
  );
});

ReaderProgress.displayName = "ReaderProgress";
export default ReaderProgress;
