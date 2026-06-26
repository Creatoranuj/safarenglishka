import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Loader2, ExternalLink } from "lucide-react";
import { openExternal } from "../../lib/native/browser";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useLocalPdfSource } from "../../hooks/useLocalPdfSource";
import { classifyPdfError } from "../../lib/pdfErrors";
import { pdfLog, pdfLogError } from "../../lib/pdfLog";
import { downloadFile } from "../../utils/fileUtils";
import { addBreadcrumb, captureException } from "../../lib/sentry";
import { isResolvableStorageViewerUrl, resolveStorageBytes } from "../../lib/naveenStoragePdf";
import { pdfJsViewerUrl } from "../../lib/pdfViewerUrl";

// Guard worker assignment for SSR / non-browser execution.
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
}

export type FastPdfReaderHandle = {
  getScrollEl: () => HTMLElement | null;
  getIframeEl: () => HTMLIFrameElement | null;
};

interface Props {
  url: string;
  /** Called when user taps the document (used to toggle reader chrome). */
  onSurfaceTap?: () => void;
  /** Called as soon as pdf.js receives bytes, before first page render. */
  onFirstByte?: () => void;
  /** Page to scroll to on first render (1-based). */
  initialPage?: number;
  /** Notified when the most-visible page changes (1-based). */
  onPageChange?: (page: number) => void;
}

/**
 * PDF.js loader params, memoised so React-PDF doesn't re-create the loader on
 * every render. Streaming + incremental fetch are enabled so large PDFs (>50MB)
 * load page-by-page over range requests instead of buffering the whole file.
 */
const PDF_OPTIONS = {
  cMapUrl: "/pdfjs/web/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/web/standard_fonts/",
  disableAutoFetch: false,
  disableStream: false,
  rangeChunkSize: 1 << 16, // 64 KB range requests
};

/** Blob and data URLs don't support HTTP range requests reliably — load whole buffer. */
const PDF_OPTIONS_LOCAL = {
  cMapUrl: "/pdfjs/web/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/web/standard_fonts/",
  disableAutoFetch: true,
  disableStream: true,
  disableRange: true,
};

import { computeFitPageWidth } from "../../lib/pdfFit";
export { computeFitPageWidth };




/**
 * A single page slot. The actual canvas is only mounted once the slot scrolls
 * near the viewport (IntersectionObserver) — this keeps memory flat on large
 * documents while autoscroll still works (placeholders preserve scroll height).
 */
function LazyPage({
  pageNumber,
  width,
  rootRef,
  onVisible,
}: {
  pageNumber: number;
  width: number;
  rootRef: React.RefObject<HTMLElement | null>;
  onVisible: (page: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [render, setRender] = useState(pageNumber <= 2);
  const placeholderHeight = Math.round(width * 1.414);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRender(true);
            onVisible(pageNumber);
          }
        }
      },
      { root: rootRef.current ?? null, rootMargin: "1200px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pageNumber, rootRef, onVisible]);

  return (
    <div
      ref={ref}
      data-page={pageNumber}
      className="mx-auto mb-3 flex w-full justify-start overflow-hidden"
      style={{ maxWidth: width }}
    >
      {render ? (
        <Page
          pageNumber={pageNumber}
          width={width}
          className="!max-w-full overflow-hidden"
          renderAnnotationLayer={false}
          renderTextLayer={false}
          loading={
            <div
              style={{ width, height: placeholderHeight }}
              className="animate-pulse rounded bg-muted"
            />
          }
        />
      ) : (
        <div style={{ width, height: placeholderHeight }} className="rounded bg-muted/60" />
      )}
    </div>
  );
}

/**
 * Fast, in-React PDF renderer. No iframe, no viewer.html, no postMessage.
 * Local files (capacitor://, file://) are materialised into blob URLs so the
 * pdf.js worker can read them; remote URLs stream via range requests.
 */
const FastPdfReader = forwardRef<FastPdfReaderHandle, Props>(
  ({ url, onSurfaceTap, onFirstByte, initialPage, onPageChange }, ref) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [numPages, setNumPages] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number | null>(null);
    const [fallbackData, setFallbackData] = useState<Uint8Array | null>(null);
    const [fallbackLoading, setFallbackLoading] = useState(false);
    const [iframeFallback, setIframeFallback] = useState(false);
    const didJump = useRef(false);
    const sawFirstByte = useRef(false);
    const triedByteFallback = useRef(false);
    const fallbackIframeRef = useRef<HTMLIFrameElement>(null);

    const { src, data, loading: resolving, error: resolveError } = useLocalPdfSource(url);

    useImperativeHandle(ref, () => ({
      getScrollEl: () => scrollRef.current,
      getIframeEl: () => fallbackIframeRef.current,
    }), []);

    // Lazy-init so the very first render already uses the viewport width
    // (avoids the brief 800px overshoot that clipped the page on mobile).
    const [pageWidth, setPageWidth] = useState<number>(() => {
      if (typeof window === "undefined") return 800;
      return computeFitPageWidth(window.visualViewport?.width ?? window.innerWidth);
    });

    // ── Pinch-to-zoom (2-finger). No UI controls. Smooth: live CSS transform
    // during pinch (no React re-render → no flicker), then commit on release
    // so PDF.js re-rasterises the canvas at the new resolution (crisp, not blurry).
    const ZOOM_KEY = "nb_pdf_zoom";
    const pagesWrapperRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState<number>(() => {
      if (typeof window === "undefined") return 1;
      const v = parseFloat(localStorage.getItem(ZOOM_KEY) || "");
      return Number.isFinite(v) && v > 0 ? Math.min(4, Math.max(0.5, v)) : 1;
    });
    const commitZoom = useCallback((next: number) => {
      const v = Math.min(4, Math.max(0.5, Math.round(next * 100) / 100));
      setZoom(v);
      try { localStorage.setItem(ZOOM_KEY, String(v)); } catch { /* ignore */ }
    }, []);

    const pinchRef = useRef<{ startDist: number; startZoom: number; live: number } | null>(null);
    useEffect(() => {
      const el = scrollRef.current;
      const wrap = pagesWrapperRef.current;
      if (!el || !wrap) return;
      const dist = (t: TouchList) => {
        const a = t[0], b = t[1];
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      };
      const onTs = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          pinchRef.current = { startDist: dist(e.touches), startZoom: zoom, live: zoom };
          wrap.style.transformOrigin = "top center";
          wrap.style.willChange = "transform";
        }
      };
      const onTm = (e: TouchEvent) => {
        if (e.touches.length === 2 && pinchRef.current) {
          e.preventDefault();
          const r = dist(e.touches) / pinchRef.current.startDist;
          const live = Math.min(4, Math.max(0.5, pinchRef.current.startZoom * r));
          pinchRef.current.live = live;
          // Live preview only — relative to the already-committed zoom.
          const rel = live / zoom;
          wrap.style.transform = `scale(${rel})`;
        }
      };
      const onTe = () => {
        if (pinchRef.current) {
          const committed = pinchRef.current.live;
          pinchRef.current = null;
          wrap.style.transform = "";
          wrap.style.willChange = "";
          if (Math.abs(committed - zoom) > 0.01) commitZoom(committed);
        }
      };
      el.addEventListener("touchstart", onTs, { passive: true });
      el.addEventListener("touchmove", onTm, { passive: false });
      el.addEventListener("touchend", onTe, { passive: true });
      el.addEventListener("touchcancel", onTe, { passive: true });
      return () => {
        el.removeEventListener("touchstart", onTs);
        el.removeEventListener("touchmove", onTm);
        el.removeEventListener("touchend", onTe);
        el.removeEventListener("touchcancel", onTe);
      };
    }, [zoom, commitZoom]);

    const renderWidth = Math.round(pageWidth * zoom);


    // Track container width so pages scale fluidly on resize / rotation.
    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const update = () => {
        const visualWidth = window.visualViewport?.width ?? window.innerWidth;
        setPageWidth(computeFitPageWidth(visualWidth, el.clientWidth));
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      window.visualViewport?.addEventListener("resize", update);
      window.addEventListener("orientationchange", update);
      return () => {
        ro.disconnect();
        window.visualViewport?.removeEventListener("resize", update);
        window.removeEventListener("orientationchange", update);
      };
    }, []);


    // IMPORTANT: clone the Uint8Array before handing it to pdf.js. The worker
    // transfers (detaches) the underlying ArrayBuffer, so re-passing the same
    // reference on a later render produces a blank/glitched canvas. A fresh
    // copy per file-prop identity keeps subsequent renders safe.
    const file = useMemo(() => {
      if (fallbackData) return { data: new Uint8Array(fallbackData) };
      if (data) return { data: new Uint8Array(data) };
      if (src) return { url: src };
      return null;
    }, [src, data, fallbackData]);

    useEffect(() => {
      setNumPages(0);
      setError(null);
      setProgress(null);
      setFallbackData(null);
      setFallbackLoading(false);
      setIframeFallback(false);
      didJump.current = false;
      sawFirstByte.current = false;
      triedByteFallback.current = false;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [src, data]);

    const onLoadError = useCallback(
      async (err: Error) => {
        const kind = classifyPdfError(err);
        addBreadcrumb("pdf", "load-error", { kind, message: err?.message });
        captureException(err, { where: "FastPdfReader", kind, url: url.slice(0, 120) });

        const canFetchFallback = !data && !fallbackData && src && /^https?:/i.test(src) && !triedByteFallback.current;
        if (canFetchFallback) {
          triedByteFallback.current = true;
          setFallbackLoading(true);
          try {
            const blob = isResolvableStorageViewerUrl(src)
              ? await resolveStorageBytes(src)
              : await fetch(src, { credentials: "omit" }).then((res) => {
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const ct = res.headers.get("content-type") || "";
                  if (/text\/html/i.test(ct)) throw new Error("Source is an HTML page, not a PDF");
                  return res.blob();
                });
            const bytes = new Uint8Array(await blob.arrayBuffer());
            setError(null);
            setFallbackData(bytes);
            addBreadcrumb("pdf", "byte-fallback:ok", { size: bytes.byteLength });
            return;
          } catch (fallbackErr) {
            captureException(fallbackErr, { where: "FastPdfReader:byteFallback", url: url.slice(0, 120) });
          } finally {
            setFallbackLoading(false);
          }
        }

        // Last resort: render the self-hosted PDF.js viewer in an iframe.
        // This often succeeds for hosts that block fetch() (no CORS) but
        // still serve PDFs to a same-origin viewer page over plain GET.
        // Skip for blob:/data:/local schemes — the self-hosted viewer's
        // file= param sanity check rejects those and the iframe goes blank.
        if (src && /^https?:/i.test(src) && !/_capacitor_file_/i.test(src)) {
          addBreadcrumb("pdf", "viewer:fallback", { url: src.slice(0, 80) });
          setError(null);
          setIframeFallback(true);
          return;
        }

        setError(err.message || "Failed to load PDF");
      },
      [data, fallbackData, src, url]
    );

    const onLoadSuccess = useCallback(
      ({ numPages: n }: { numPages: number }) => {
        if (!sawFirstByte.current) {
          sawFirstByte.current = true;
          onFirstByte?.();
          try { window.dispatchEvent(new CustomEvent("pdf-first-byte")); } catch {}
        }
        setError(null);
        setProgress(null);
        setNumPages(n);
        addBreadcrumb("pdf", "load-success", { pages: n });
      },
      [onFirstByte]
    );

    const onLoadProgress = useCallback(({ loaded, total }: { loaded: number; total: number }) => {
      if (loaded > 0 && !sawFirstByte.current) {
        sawFirstByte.current = true;
        onFirstByte?.();
        try { window.dispatchEvent(new CustomEvent("pdf-first-byte")); } catch {}
      }
      if (total > 0) setProgress(Math.min(100, Math.round((loaded / total) * 100)));
    }, [onFirstByte]);

    // Jump to the saved page once pages exist.
    useEffect(() => {
      if (didJump.current || !numPages || !initialPage || initialPage <= 1) return;
      const root = scrollRef.current;
      if (!root) return;
      const t = window.setTimeout(() => {
        const el = root.querySelector<HTMLElement>(`[data-page="${initialPage}"]`);
        if (el) {
          root.scrollTo({ top: el.offsetTop - 8 });
          didJump.current = true;
        }
      }, 150);
      return () => window.clearTimeout(t);
    }, [numPages, initialPage]);

    const handleVisible = useCallback(
      (page: number) => {
        if (didJump.current || !initialPage || initialPage <= 1) onPageChange?.(page);
      },
      [onPageChange, initialPage]
    );

    if (resolving || fallbackLoading) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 text-sm text-muted-foreground dark:bg-neutral-900">
          <Loader2 className="h-5 w-5 animate-spin" /> {fallbackLoading ? "Retrying as local file…" : "Preparing file…"}
        </div>
      );
    }

    if (resolveError) {
      pdfLogError("resolve-error", resolveError, { url });
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-100 p-8 text-center text-sm dark:bg-neutral-900">
          <p className="text-destructive">Could not load this PDF in the viewer.</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => { pdfLog("download", { url }); void downloadFile(url); }}
              className="inline-flex items-center gap-1 text-primary underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Download PDF
            </button>
            <button
              type="button"
              onClick={() => openExternal(url)}
              className="inline-flex items-center gap-1 text-primary underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open externally
            </button>
          </div>
        </div>
      );
    }

    if (iframeFallback && src) {
      return (
        <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-900">
          <iframe
            ref={fallbackIframeRef}
            src={pdfJsViewerUrl(src)}
            title="PDF"
            className="h-full w-full border-0"
            allow="fullscreen"
          />
        </div>
      );
    }

    // Safety net: resolver finished but produced no source AND no error.
    // Without this guard the viewer would render a fully blank container,
    // which is exactly what users were seeing on APK for missing offline files.
    if (!file) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-100 p-8 text-center text-sm dark:bg-neutral-900">
          <p className="text-destructive">Offline copy missing for this file.</p>
          <p className="text-muted-foreground">
            Connect to the internet and re-download it to view again.
          </p>
        </div>
      );
    }

    return (
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-neutral-100 px-2 [&_.react-pdf__Document]:w-full [&_.react-pdf__Page]:!mx-auto [&_.react-pdf__Page]:!w-full [&_.react-pdf__Page]:!max-w-full [&_.react-pdf__Page__canvas]:!h-auto [&_.react-pdf__Page__canvas]:!w-full [&_.react-pdf__Page__canvas]:!max-w-full [&_.react-pdf__Page__canvas]:!block dark:bg-neutral-900"
        onClick={onSurfaceTap}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {progress !== null && (
          <div className="sticky top-0 z-20 h-1 w-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {file && (
          <Document
            file={file}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            onLoadProgress={onLoadProgress}
            options={fallbackData || data || /^(blob:|data:)/i.test(src || "") ? PDF_OPTIONS_LOCAL : PDF_OPTIONS}
            loading={
              <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress !== null ? `Loading PDF… ${progress}%` : "Loading PDF…"}
              </div>
            }
            error={
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-destructive">
                <p>Could not load PDF.</p>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => { pdfLog("download", { url }); void downloadFile(url); }}
                    className="inline-flex items-center gap-1 text-primary underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Download
                  </button>
                  <button
                    type="button"
                    onClick={() => openExternal(url)}
                    className="inline-flex items-center gap-1 text-primary underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Open externally
                  </button>
                </div>
              </div>
            }
            className="py-3"
          >
            <div ref={pagesWrapperRef} style={{ transformOrigin: "top center" }}>
              {!error &&
                Array.from({ length: numPages }, (_, i) => (
                  <LazyPage
                    key={i + 1}
                    pageNumber={i + 1}
                    width={renderWidth}
                    rootRef={scrollRef}
                    onVisible={handleVisible}
                  />
                ))}
            </div>
          </Document>
        )}
      </div>
    );
  }
);

FastPdfReader.displayName = "FastPdfReader";
export default FastPdfReader;
