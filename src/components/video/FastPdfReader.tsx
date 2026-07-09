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
import { ExternalLink } from "lucide-react";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useLocalPdfSource } from "../../hooks/useLocalPdfSource";
import { classifyPdfError } from "../../lib/pdfErrors";
import { pdfLog, pdfLogError } from "../../lib/pdfLog";
import { readerRouteForUrl, traceReader } from "../../lib/readerDiagnostics";
import { downloadFile } from "../../utils/fileUtils";
import { addBreadcrumb, captureException } from "../../lib/sentry";
import { isResolvableStorageViewerUrl, resolveStorageBytes } from "@/lib/native/naveenStoragePdf";
import { isKnownNonPdfWebUrl } from "../../lib/detectFileType";
import { openExternal } from "../../lib/native/browser";
import { fetchPdfViaNativeHttp } from "../../lib/nativePdfHttp";
import { SpokeSpinner } from "../ui/spoke-spinner";

// Guard worker assignment for SSR / non-browser execution.
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  // Silence noisy "Cannot load system font: TimesNewRomanPSMT" warnings.
  // pdf.js falls back to bundled standard fonts (Foxit/Liberation) automatically;
  // the warning is informational and clutters the console on every PDF open.
  try {
    // 0=errors, 1=warnings, 5=infos. Default is 1 → drop to 0 to mute font warnings.
    const pdfjsAny = pdfjs as unknown as Record<string, unknown>;
    pdfjsAny.verbosity = 0;
  } catch { /* noop */ }

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
  /** Fired once after mount when scroll/iframe refs are ready to read. */
  onReady?: () => void;
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
  // Stream pages on demand; do NOT greedily prefetch the entire file. Greedy
  // prefetch on Capacitor WebView amplifies CORS/Range failures into a single
  // blank-loader symptom for huge PDFs.
  disableAutoFetch: true,
  disableStream: false,
  rangeChunkSize: 1 << 16, // 64 KB range requests
  // Silence "Cannot load system font: TimesNewRomanPSMT" warnings emitted by
  // the pdf.js worker. The worker reads verbosity from the loader params; the
  // earlier `pdfjs.verbosity = 0` on the main thread had no effect inside the
  // worker, so every PDF open spammed the console.
  verbosity: 0,
  // Prefer pdf.js's bundled Foxit/Liberation standard fonts over the host's
  // system fonts. This avoids the worker probing for TimesNewRomanPS* glyphs
  // that don't exist on Android/Capacitor and ChromeOS at all.
  useSystemFonts: false,
};

/** Blob and data URLs don't support HTTP range requests reliably — load whole buffer. */
const PDF_OPTIONS_LOCAL = {
  cMapUrl: "/pdfjs/web/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/web/standard_fonts/",
  disableAutoFetch: true,
  disableStream: true,
  disableRange: true,
  verbosity: 0,
  useSystemFonts: false,
};

const isAbortLike = (err: unknown): boolean => {
  const e = err as { name?: string; message?: string } | null | undefined;
  const text = `${e?.name || ""} ${e?.message || String(err || "")}`;
  return /AbortError|AbortException|aborted a request|operation was aborted|worker was terminated|\baborted\b/i.test(text);
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
            loading={<div style={{ width, height: placeholderHeight }} className="bg-background" />}
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
  ({ url, onSurfaceTap, onFirstByte, initialPage, onPageChange, onReady }, ref) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [numPages, setNumPages] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number | null>(null);
    const [fallbackData, setFallbackData] = useState<Uint8Array | null>(null);
    const [fallbackLoading, setFallbackLoading] = useState(false);
    const didJump = useRef(false);
    const sawFirstByte = useRef(false);
    const triedByteFallback = useRef(false);
    const lastProgressAtRef = useRef<number>(Date.now());
    const readyFiredRef = useRef(false);
    const fallbackAbortRef = useRef<AbortController | null>(null);

    const { src, data, loading: resolving, error: resolveError } = useLocalPdfSource(url);
    const route = readerRouteForUrl(url);

    useImperativeHandle(ref, () => ({
      getScrollEl: () => scrollRef.current,
      getIframeEl: () => null,
    }), []);

    // Fire onReady once ONLY after the document is actually renderable:
    //   - canvas branch: numPages > 0 (pdf.js parsed the file).
    // The earlier "fire as soon as scrollRef mounts" path made
    // DocumentReader flip its health chip to "pdf-ready" and unmount the
    // progress overlay before pdf.js had a single page — leaving Drive
    // PDFs visually blank with a stale "ready" status badge.
    useEffect(() => {
      if (readyFiredRef.current || !onReady) return;
      const canvasReady = numPages > 0 && !!scrollRef.current;
      if (!canvasReady) return;
      readyFiredRef.current = true;
      requestAnimationFrame(() => onReady());
    }, [onReady, numPages]);

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
      traceReader(route, "loading", "fast-reader-source", {
        src: src?.slice(0, 160),
        hasData: !!data,
        resolving,
      });
    }, [data, resolving, route, src]);

    useEffect(() => {
      setNumPages(0);
      setError(null);
      setProgress(null);
      setFallbackData(null);
      setFallbackLoading(false);
      didJump.current = false;
      sawFirstByte.current = false;
      triedByteFallback.current = false;
      lastProgressAtRef.current = Date.now();
      fallbackAbortRef.current?.abort();
      fallbackAbortRef.current = null;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [src, data]);

    useEffect(() => () => {
      fallbackAbortRef.current?.abort();
    }, []);

    const friendlyPdfError = useCallback((err: unknown): string => {
      const e = err as { name?: string; message?: string; status?: number };
      const msg = e?.message || String(err || "");
      const status = e?.status ?? Number(msg.match(/HTTP\s+(\d{3})/i)?.[1] || 0);
      if (status === 403 || status === 404) {
        return "This Drive file is private — ask the uploader to enable link sharing.";
      }
      if (status === 503 || status === 502 || status === 504) {
        return "PDF service is busy. Retry in a few seconds.";
      }
      if (/HTML page, not a PDF|Drive did not return a PDF|HTTP 415/i.test(msg)) {
        return "This Drive file is private — ask the uploader to enable link sharing.";
      }
      // Truncated / mismatched response from CDN or proxy — pdf.js's raw
      // message is scary jargon; give the user something actionable.
      if (/exceeds response Body|Content-Length header of network response/i.test(msg)) {
        return "The file download was cut short. Tap Retry to fetch a fresh copy.";
      }
      return msg || "Failed to load PDF.";
    }, []);

    const fetchPdfBlobWithRetry = useCallback(async (source: string, signal: AbortSignal): Promise<Blob> => {
      const maxAttempts = /pdf-proxy\?kind=drive|[?&]kind=drive/i.test(source) ? 3 : 2;
      let lastErr: Error | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const sep = source.includes("?") ? "&" : "?";
          // Byte-fallback ONLY runs after the streaming path already failed.
          // Common root cause: truncated cached response (CDN/proxy sent fewer
          // bytes than Content-Length promised → "Content-Length header of
          // network response exceeds response Body"). Reusing the browser
          // cache on attempt 1 would return the same poisoned bytes and the
          // fallback would fail identically. Always cache-bust from attempt 1.
          const attemptUrl = `${source}${sep}_nbretry=${Date.now()}_${attempt}`;
          const nativeBlob = await fetchPdfViaNativeHttp(attemptUrl, signal);
          if (nativeBlob) return nativeBlob;
          const res = await fetch(attemptUrl, {
            credentials: "omit",
            cache: "reload",
            signal,
          });
          if (res.status === 403 || res.status === 404) {
            const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
            err.status = res.status;
            throw err;
          }
          if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
            err.status = res.status;
            throw err;
          }
          const ct = res.headers.get("content-type") || "";
          if (/text\/html/i.test(ct)) throw new Error("Source is an HTML page, not a PDF");
          return res.blob();
        } catch (err) {
          const msg = (err as Error)?.message || "";
          if (isAbortLike(err)) throw err;
          lastErr = err instanceof Error ? err : new Error(String(err));
          const status = (lastErr as Error & { status?: number }).status ?? Number(msg.match(/HTTP\s+(\d{3})/i)?.[1] || 0);
          const retryable = status === 503 || status === 502 || status === 504 || status === 429;
          if (!retryable || attempt === maxAttempts) break;
          traceReader(route, "retrying", "byte-fallback-503-retry", { attempt, status });
          await new Promise((resolve) => window.setTimeout(resolve, 350 * attempt));
        }
      }
      throw lastErr ?? new Error("Failed to fetch PDF bytes");
    }, [route]);

    const fetchWholeFileFallback = useCallback(async () => {
      if (!src || !/^https?:/i.test(src) || triedByteFallback.current || data || fallbackData) return false;
      triedByteFallback.current = true;
      setFallbackLoading(true);
      fallbackAbortRef.current?.abort();
      const controller = new AbortController();
      fallbackAbortRef.current = controller;
      // Heartbeat: byte-fallback is a single fetch()+arrayBuffer() await so it
      // emits no `pdf-progress` or `pdf-first-byte` events. Without a heartbeat
      // the DocumentReader's 25s ERROR_TIMEOUT_MS fires mid-download on large
      // PDFs / slow networks and shows a false "Couldn't load the document."
      // We dispatch `pdf-first-byte` immediately and then keep nudging progress
      // (indeterminate ticks) every 3s so the parent's error timer keeps
      // resetting until either the fetch resolves (`pdf-ready` via
      // onLoadSuccess) or rejects (`pdf-error`).
      try { window.dispatchEvent(new CustomEvent("pdf-first-byte", { detail: { fallback: true } })); } catch {}
      let heartbeatPct = 0;
      const heartbeat = window.setInterval(() => {
        if (controller.signal.aborted) return;
        heartbeatPct = (heartbeatPct + 5) % 95; // stays <100 so we never fake completion
        try {
          window.dispatchEvent(new CustomEvent("pdf-progress", { detail: { percent: heartbeatPct, fallback: true } }));
        } catch {}
      }, 3000);
      try {
        traceReader(route, "retrying", "byte-fallback-start", { src: src.slice(0, 160) });
        const blob = isResolvableStorageViewerUrl(src)
          ? await resolveStorageBytes(src, controller.signal)
          : await fetchPdfBlobWithRetry(src, controller.signal);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        setError(null);
        setFallbackData(bytes);
        traceReader(route, "fallback", "byte-fallback-success", { bytes: bytes.byteLength });
        addBreadcrumb("pdf", "byte-fallback:ok", { size: bytes.byteLength });
        return true;
      } catch (fallbackErr) {
        const msg = (fallbackErr as Error)?.message || "";
        if (isAbortLike(fallbackErr)) {
          addBreadcrumb("pdf", "byte-fallback:aborted", { url: url.slice(0, 80) });
          traceReader(route, "unmounted", "byte-fallback-aborted", { message: msg });
          return false;
        }
        const friendly = friendlyPdfError(fallbackErr);
        setError(friendly);
        try { window.dispatchEvent(new CustomEvent("pdf-error", { detail: friendly })); } catch {}
        traceReader(route, "error", "byte-fallback-error", { message: friendly });
        const status = (fallbackErr as { status?: number })?.status ?? Number(msg.match(/HTTP\s+(\d{3})/i)?.[1] || 0);
        if (status !== 403 && status !== 404 && !/HTML page, not a PDF|HTTP 415/i.test(msg)) {
          captureException(fallbackErr, { where: "FastPdfReader:byteFallback", url: url.slice(0, 120) });
        }
        return false;
      } finally {
        window.clearInterval(heartbeat);
        if (fallbackAbortRef.current === controller) fallbackAbortRef.current = null;
        setFallbackLoading(false);
      }
    }, [data, fallbackData, fetchPdfBlobWithRetry, friendlyPdfError, route, src, url]);

    const onLoadError = useCallback(
      async (err: Error) => {
        // pdf.js / fetch raise AbortError whenever the user navigates away
        // (component unmount aborts the loadingTask). It isn't an error —
        // surfacing it as a load failure made the reader flash "Failed to
        // load" and spammed Sentry. Drop silently.
        const msg = err?.message || "";
        if (isAbortLike(err)) {
          addBreadcrumb("pdf", "load-aborted", { url: url.slice(0, 80) });
          traceReader(route, "unmounted", "load-aborted", { message: msg });
          return;
        }
        const kind = classifyPdfError(err);
        addBreadcrumb("pdf", "load-error", { kind, message: msg });
        traceReader(route, "error", "load-error", { kind, message: msg });
        captureException(err, { where: "FastPdfReader", kind, url: url.slice(0, 120) });

        if (await fetchWholeFileFallback()) return;

        const friendly = friendlyPdfError(err);
        try { window.dispatchEvent(new CustomEvent("pdf-error", { detail: friendly })); } catch {}
        setError(friendly);
      },
      [fetchWholeFileFallback, friendlyPdfError, route, url]
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
        traceReader(route, "ready", "load-success", { pages: n });
        // CRITICAL: DocumentReader's ReaderProgress overlay (opaque
        // bg-background, z-20) only unmounts on `pdf-ready`. Drive/iframe +
        // Notion already dispatch it, but the canvas branch never did — so
        // Supabase / CDN / jsDelivr / Drive Reader-Mode PDFs stayed blank
        // behind the overlay forever (root cause of the "DPP/Notes/PDF open
        // ho ke blank" bug). Fire it the moment pdf.js confirms the document
        // parsed, so the first page is visible immediately after load.
        try {
          window.dispatchEvent(new CustomEvent("pdf-ready", { detail: { pages: n, url: url.slice(0, 120) } }));
          // Debug-gated: only logs when ?debug=1 or nb_pdf_debug=1.
          // eslint-disable-next-line no-console
          if (typeof window !== "undefined" && window.nb_pdf_debug) console.info("[FastPdfReader] pdf-ready dispatched", { pages: n });
        } catch {}
      },
      [onFirstByte, route, url]
    );

    // Throttle progress dispatch: pdf.js fires `onLoadProgress` per chunk
    // (60+/s on slow nets), which spammed setState + custom events. We
    // coalesce into a single rAF tick (~16ms) and only emit when the
    // rounded percent actually changes.
    const lastEmittedPct = useRef<number>(-2);
    const pendingPct = useRef<number | null>(null);
    const rafScheduled = useRef<boolean>(false);
    const flushProgress = useCallback(() => {
      rafScheduled.current = false;
      const pct = pendingPct.current;
      if (pct === null) return;
      pendingPct.current = null;
      if (pct === lastEmittedPct.current) return;
      lastEmittedPct.current = pct;
      if (pct >= 0) setProgress(pct);
      try {
        window.dispatchEvent(
          new CustomEvent("pdf-progress", { detail: { percent: pct } }),
        );
      } catch {}
    }, []);

    const onLoadProgress = useCallback(({ loaded, total }: { loaded: number; total: number }) => {
      lastProgressAtRef.current = Date.now();
      if (loaded > 0 && !sawFirstByte.current) {
        sawFirstByte.current = true;
        traceReader(route, "first-byte", "load-progress-first-byte", { loaded, total });
        onFirstByte?.();
        try { window.dispatchEvent(new CustomEvent("pdf-first-byte")); } catch {}
      }
      // -1 ⇒ indeterminate (no Content-Length).
      pendingPct.current = total > 0
        ? Math.min(100, Math.round((loaded / total) * 100))
        : loaded > 0 ? -1 : null;
      if (!rafScheduled.current) {
        rafScheduled.current = true;
        requestAnimationFrame(flushProgress);
      }
    }, [onFirstByte, flushProgress, route]);

    // Capacitor Android WebView can occasionally stall pdf.js streaming/range
    // reads on signed storage URLs (progress freezes, e.g. at 63%, without an
    // onLoadError). If no pages are ready and progress stops moving, switch to
    // a whole-file byte fallback so PDFs/DPPs/Notes still open in-app.
    useEffect(() => {
      if (!src || !/^https?:/i.test(src) || numPages > 0 || fallbackData || fallbackLoading || data) return;
      const id = window.setInterval(() => {
        if (numPages > 0 || triedByteFallback.current) return;
        if (Date.now() - lastProgressAtRef.current < 6000) return;
        addBreadcrumb("pdf", "stream-stalled:fallback", { progress, url: src.slice(0, 80) });
        traceReader(route, "timeout", "stream-stalled", { progress, src: src.slice(0, 160) });
        // `false` can mean "already falling back" or "lifecycle abort"; the
        // fallback function itself owns real error reporting. Do not synthesize
        // a failure here or concurrent timers can turn a healthy byte fallback
        // into a false "Couldn't load" screen.
        void fetchWholeFileFallback();
      }, 4000);
      return () => window.clearInterval(id);
    }, [data, fallbackData, fallbackLoading, fetchWholeFileFallback, numPages, progress, route, src]);

    // Hard mount-timeout: even if progress keeps ticking (or no events fire
    // at all — some Capacitor WebView + signed-URL combos go silent), if no
    // pages are mounted within 15s, move forward to whole-file bytes. Never
    // flip back to a Drive/Google iframe, which is the known blank path.
    useEffect(() => {
      if (!src || numPages > 0) return;
      const t = window.setTimeout(() => {
        if (numPages > 0) return;
        addBreadcrumb("pdf", "mount-timeout:byte-fallback", { progress, url: src.slice(0, 80) });
        traceReader(route, "timeout", "mount-timeout", { progress, src: src.slice(0, 160) });
        if (/^https?:/i.test(src) && !/_capacitor_file_/i.test(src) && !isKnownNonPdfWebUrl(src)) {
          // Forward-only degradation: streaming → byte fallback. A no-op/abort
          // result is lifecycle, not failure; real failures are set inside the
          // fallback path after retry classification.
          void fetchWholeFileFallback();
        }
      }, 15000);
      return () => window.clearTimeout(t);
    }, [fetchWholeFileFallback, src, numPages, progress, route]);



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

    if (resolving || (fallbackLoading && !file)) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <SpokeSpinner size={28} ariaLabel={fallbackLoading ? "Retrying" : "Loading"} />
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
              onClick={() => { pdfLog("retry", { url }); window.location.reload(); }}
              className="inline-flex items-center gap-1 text-primary underline"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (src && isKnownNonPdfWebUrl(src)) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-100 p-8 text-center text-sm dark:bg-neutral-900">
          <p className="text-foreground">This attachment is a web page, not a PDF.</p>
          <button
            type="button"
            onClick={() => void openExternal(src, { preferWebView: false })}
            className="inline-flex items-center gap-1 text-primary underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in browser
          </button>
        </div>
      );
    }

    if (error) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-100 p-8 text-center text-sm dark:bg-neutral-900">
          <p className="max-w-sm text-destructive">{error}</p>
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
              onClick={() => { pdfLog("retry", { url }); setError(null); triedByteFallback.current = false; void fetchWholeFileFallback(); }}
              className="inline-flex items-center gap-1 text-primary underline"
            >
              Retry
            </button>
          </div>
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
        {fallbackLoading && (
          <div className="sticky top-1 z-20 mx-auto mt-2 w-fit rounded-full border border-border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
            Stabilizing PDF stream…
          </div>
        )}
        {file && (
          <Document
            file={file}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            onLoadProgress={onLoadProgress}
            options={
              fallbackData ||
              data ||
              /^(blob:|data:)/i.test(src || "") ||
              // Drive pdf-proxy streams `Accept-Ranges: none` — using the
              // range-enabled PDF_OPTIONS makes pdf.js issue Range requests
              // that the proxy ignores (returns full body each time). The
              // size mismatch aborts the load right before completion (the
              // classic "loads to 90% then fails" symptom on Drive PDFs).
              // Force whole-buffer options so pdf.js consumes the one clean
              // stream the proxy is designed to serve.
              /\/pdf-proxy\?kind=drive|[?&]kind=drive/i.test(src || "")
                ? PDF_OPTIONS_LOCAL
                : PDF_OPTIONS
            }
            loading={
              <div className="flex h-40 items-center justify-center">
                <SpokeSpinner size={28} />
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
                    onClick={() => { pdfLog("retry", { url }); setError(null); }}
                    className="inline-flex items-center gap-1 text-primary underline"
                  >
                    Retry
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
