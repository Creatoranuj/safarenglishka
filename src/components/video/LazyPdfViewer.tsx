import { Suspense, useEffect, type ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { lazyWithRetry } from "../../lib/lazyWithRetry";

/**
 * Lazy wrapper around PdfViewerWithAutoScroll.
 *
 * Why: react-pdf + pdfjs-dist together weigh ~131KB gzip. Statically
 * importing them in LessonView.tsx loaded the chunk for every lesson —
 * including video-only lessons that never open a PDF. This wrapper
 * defers the chunk until a PDF is actually rendered, and warm-prefetches
 * it on idle so the first tap still feels instant (<200ms warm load).
 *
 * Drop-in replacement: same props as PdfViewerWithAutoScroll. No ref
 * forwarding because no current call-site in LessonView uses one.
 */
const InnerPdfViewer = lazyWithRetry(
  () => import("./PdfViewerWithAutoScroll"),
);

type Props = ComponentProps<typeof import("./PdfViewerWithAutoScroll").default>;

// Warm-prefetch the chunk after first paint so the first PDF tap is
// instant. Runs once per session; safe on web + Capacitor.
let prefetched = false;
function prefetchPdfViewer() {
  if (prefetched) return;
  prefetched = true;
  // requestIdleCallback isn't available on iOS WebView — fall back to setTimeout.
  const ric: (cb: () => void) => void =
    (typeof window !== "undefined" && (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback) ||
    ((cb: () => void) => setTimeout(cb, 1500));
  ric(() => { void import("./PdfViewerWithAutoScroll"); });
}

/**
 * Skeleton fallback shown while the PDF chunk + first page resolve.
 *
 * Replaces the previous 6px spinner with a full-bleed document skeleton
 * (header bar, indeterminate progress bar, faux text lines) so users on
 * slow networks / cold Capacitor WebViews never see a blank panel after
 * tapping a PDF chip. Mirrors the Lovable Stack Overflow pattern:
 * immediate visual feedback → resolve → mount viewer.
 */
function Fallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Preparing your document"
      className="flex flex-col w-full h-full min-h-[320px] bg-background p-4 gap-3"
      data-testid="pdf-skeleton"
    >
      {/* Header row: title placeholder + spinner */}
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
        <div className="h-3 flex-1 rounded bg-muted animate-pulse" />
      </div>
      {/* Indeterminate progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 rounded-full bg-primary/70 animate-[pdf-indeterminate_1.2s_ease-in-out_infinite]" />
      </div>
      <p className="text-xs text-muted-foreground">Preparing your document…</p>
      {/* Faux page block */}
      <div className="mt-2 flex-1 rounded-lg border border-border/40 bg-card p-4 space-y-2.5">
        <div className="h-3 w-11/12 rounded bg-muted animate-pulse" />
        <div className="h-3 w-10/12 rounded bg-muted animate-pulse" />
        <div className="h-3 w-9/12 rounded bg-muted animate-pulse" />
        <div className="h-3 w-11/12 rounded bg-muted animate-pulse" />
        <div className="h-3 w-8/12 rounded bg-muted animate-pulse" />
        <div className="h-3 w-10/12 rounded bg-muted animate-pulse" />
      </div>
      <span className="sr-only">Loading PDF viewer…</span>
      {/* Keyframes for the indeterminate bar (scoped, no Tailwind config change) */}
      <style>{`
        @keyframes pdf-indeterminate {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(120%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  );
}

export default function LazyPdfViewer(props: Props) {
  useEffect(() => { prefetchPdfViewer(); }, []);
  return (
    <Suspense fallback={<Fallback />}>
      <InnerPdfViewer {...props} />
    </Suspense>
  );
}

// Allow external callers (e.g. a lesson page mounting) to warm the chunk.
export { prefetchPdfViewer };