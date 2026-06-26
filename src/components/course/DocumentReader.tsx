import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2, Download, Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import PdfViewer from "../video/LazyPdfViewer";
import ReaderSkeleton from "./ReaderSkeleton";
import ReaderErrorOverlay from "./ReaderErrorOverlay";
import { usePdfResumePosition } from "../../hooks/usePdfResumePosition";
import { isRedirectHeavyUrl, openExternal } from "../../lib/native/browser";
import { downloadDocument } from "../../lib/downloadDocument";
import { isDocSaved, toggleDoc } from "../../lib/docLibrary";
import { cn } from "../../lib/utils";
import { Capacitor } from "@capacitor/core";


interface DocumentReaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  url: string;
  onBack: () => void;
  /** Optional stable id used to persist last-page across re-opens. */
  lessonId?: string | null;
}

const HIDE_AFTER_MS = 5000;
const ERROR_TIMEOUT_MS = 25000;

/**
 * Immersive document reader for PDF / DPP / Notes.
 *
 * UX:
 *  - No bottom Prev/Next bar.
 *  - Top header auto-hides after 3s; tap top edge or swipe down to reveal.
 *  - Fullscreen toggle for a true cinema mode.
 *  - Loading skeleton + error overlay with Retry / Open-externally.
 *  - Last-viewed page is restored when the lesson is re-opened.
 */
const DocumentReader = memo(
  ({ title, subtitle, badge, url, onBack, lessonId }: DocumentReaderProps) => {
    const [chromeVisible, setChromeVisible] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSkeleton, setShowSkeleton] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [retryNonce, setRetryNonce] = useState(0);
    const nativeOpenAttemptedRef = useRef<string | null>(null);

    const docId = lessonId || url;
    const [saved, setSaved] = useState<boolean>(() => isDocSaved(docId));
    const [downloading, setDownloading] = useState(false);


    const rootRef = useRef<HTMLDivElement>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { initialPage, savePage } = usePdfResumePosition({ lessonId, url });

    // ── Chrome auto-hide ────────────────────────────────────────────────────
    const clearHide = useCallback(() => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }, []);

    const scheduleHide = useCallback(() => {
      clearHide();
      const ms = isFullscreen ? 1500 : HIDE_AFTER_MS;
      hideTimerRef.current = setTimeout(() => setChromeVisible(false), ms);
    }, [clearHide, isFullscreen]);

    const showChrome = useCallback(() => {
      setChromeVisible(true);
      scheduleHide();
    }, [scheduleHide]);

    const hideChrome = useCallback(() => {
      clearHide();
      setChromeVisible(false);
    }, [clearHide]);

    useEffect(() => {
      scheduleHide();
      return clearHide;
    }, [scheduleHide, clearHide]);

    // Android / browser hardware-back support for the DocumentReader.
    // Push a `pdfFullscreen` sentinel onto history so `useAndroidBackButton`
    // recognises the reader as an overlay (step1-overlay-pop). When the
    // user presses back we pop the sentinel → popstate fires → onBack runs.
    //
    // CRITICAL: track whether popstate already consumed our sentinel.
    // Otherwise the cleanup effect's `history.back()` runs on cold-deep-link
    // mounts where the sentinel is the only entry, popping the user out of
    // the WebView (closes the Android activity).
    useEffect(() => {
      const poppedRef = { current: false };
      try {
        window.history.pushState({ pdfFullscreen: true }, "");
      } catch {}
      const onPop = () => {
        poppedRef.current = true;
        onBack();
      };
      window.addEventListener("popstate", onPop);
      return () => {
        window.removeEventListener("popstate", onPop);
        if (poppedRef.current) return;
        try {
          if (window.history.state?.pdfFullscreen) {
            window.history.back();
          }
        } catch {}
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    // Custom viewer hosts (Safar English Ka Storage, GitHub-Storages CDN) render
    // their own PDF viewer page inside the iframe → they never dispatch our
    // `pdf-first-byte` / `pdf-ready` events. Without this guard the 25-s
    // error timeout always fires and shows "Still loading… the file may be
    // unavailable." on a perfectly rendered document.
    const isSelfHostedViewer = /(?:storage-naveenbharat-recording|github-storages-cdn)\.vercel\.app/i.test(url);

    // ── Skeleton fade + error timeout ───────────────────────────────────────
    useEffect(() => {
      setShowSkeleton(true);
      setErrorMsg(null);
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      // Skeleton fades after 900ms — PdfViewer has its own loader for the
      // remainder, which keeps perceived latency low even on slow networks.
      skeletonTimerRef.current = setTimeout(() => setShowSkeleton(false), 900);
      if (!isSelfHostedViewer) {
        errorTimerRef.current = setTimeout(() => {
          setErrorMsg("Still loading… the file may be unavailable.");
        }, ERROR_TIMEOUT_MS);
      }
      return () => {
        if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      };
    }, [url, retryNonce, isSelfHostedViewer]);


    const markPdfProgress = useCallback(() => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      if (showSkeleton) setShowSkeleton(false);
      if (errorMsg) setErrorMsg(null);
    }, [showSkeleton, errorMsg]);

    // Cancel error-timeout if bytes arrive or window emits a generic ready.
    useEffect(() => {
      const onReady = () => markPdfProgress();
      const onErr = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        setErrorMsg(typeof detail === "string" ? detail : "The document failed to load.");
      };
      window.addEventListener("pdf-ready", onReady);
      window.addEventListener("pdf-first-byte", onReady);
      window.addEventListener("pdf-error", onErr as EventListener);
      return () => {
        window.removeEventListener("pdf-ready", onReady);
        window.removeEventListener("pdf-first-byte", onReady);
        window.removeEventListener("pdf-error", onErr as EventListener);
      };
    }, [markPdfProgress]);

    // ── Fullscreen ──────────────────────────────────────────────────────────
    useEffect(() => {
      const onChange = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", onChange);
      return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const toggleFullscreen = useCallback(async () => {
      const el = rootRef.current;
      if (!el) return;
      try {
        if (!document.fullscreenElement) {
          await el.requestFullscreen?.();
        } else {
          await document.exitFullscreen?.();
        }
      } catch {
        // iOS Safari WebView / older Android may throw — fail silently.
      }
    }, []);

    // ── Swipe gestures (vertical only; horizontal needs 2 fingers) ──────────
    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      let startX = 0;
      let startY = 0;
      let startT = 0;
      let touchCount = 0;

      const onStart = (e: TouchEvent) => {
        if (e.touches.length > 2) return;
        touchCount = e.touches.length;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startT = Date.now();
      };
      const onEnd = (e: TouchEvent) => {
        if (touchCount === 0) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const dt = Date.now() - startT;
        if (dt > 600) return;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        // Tap (single finger, minimal movement): toggle chrome and reset 3s timer.
        if (touchCount === 1 && absX < 10 && absY < 10 && dt < 300) {
          if (chromeVisible) hideChrome();
          else showChrome();
          return;
        }
        // Vertical swipe (single finger): reveal/hide chrome.
        if (touchCount === 1 && absY > 40 && absY > absX * 1.5) {
          if (dy > 0 && startY < 120) showChrome();
          else if (dy < 0 && chromeVisible) hideChrome();
        }
      };

      el.addEventListener("touchstart", onStart, { passive: true });
      el.addEventListener("touchend", onEnd, { passive: true });
      return () => {
        el.removeEventListener("touchstart", onStart);
        el.removeEventListener("touchend", onEnd);
      };
    }, [chromeVisible, showChrome, hideChrome]);

    // ── Retry ───────────────────────────────────────────────────────────────
    const handleRetry = useCallback(() => {
      setErrorMsg(null);
      setRetryNonce((n) => n + 1);
    }, []);

    const handleOpenExternal = useCallback(() => {
      try {
        openExternal(url);
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }, [url]);

    // ── Download + Save to library ─────────────────────────────────────────
    const handleDownload = useCallback(async (e: React.MouseEvent) => {
      e.stopPropagation();
      showChrome();
      if (downloading || !url) return;
      setDownloading(true);
      const toastId = toast.loading("Downloading…");
      try {
        const { location } = await downloadDocument(url, title);
        toast.success(location, { id: toastId });
      } catch (err) {
        console.error("[DocumentReader] download failed", err);
        toast.error("Download failed. Try Open externally.", { id: toastId });
      } finally {
        setDownloading(false);
      }
    }, [url, title, downloading, showChrome]);

    const handleToggleSave = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      showChrome();
      const nowSaved = toggleDoc({ id: docId, title, subtitle, badge, url });
      setSaved(nowSaved);
      toast.success(nowSaved ? "Saved to Library" : "Removed from Library", {
        id: "doc-library-toggle",
        duration: 1500,
      });
    }, [docId, title, subtitle, badge, url, showChrome]);

    // Always render Notion / Google Drive / Docs through the in-app PdfViewer
    // surface (NotionPageRenderer for Notion, drive preview iframe for Drive).
    // The native InAppBrowser surfaces leaked the provider's own page chrome
    // ("Get Notion free", Drive toolbar) and overlapped the status bar.
    // Keeping everything inside PdfViewer guarantees: no provider chrome,
    // safe-area respected, consistent back-button + swipe-back behaviour.
    const shouldUseNativeBrowserSurface = false;
    // Touch unused imports to keep tree-shake happy without removing the
    // capability — power users can still trigger openExternal from the menu.
    void Capacitor; void isRedirectHeavyUrl;

    useEffect(() => {
      if (!shouldUseNativeBrowserSurface) return;
      if (nativeOpenAttemptedRef.current === url) return;
      nativeOpenAttemptedRef.current = url;
      setShowSkeleton(false);
      setErrorMsg(null);
      void openExternal(url).catch((err) => {
        console.error("[DocumentReader] native browser open failed", err);
        setErrorMsg("Could not open this document.");
      });
    }, [shouldUseNativeBrowserSurface, url]);

    if (shouldUseNativeBrowserSurface) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <header className="safe-area-top z-30 flex min-h-[48px] items-center gap-2 border-b bg-card/95 px-3 shadow-sm">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Go back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="line-clamp-1 text-sm font-bold text-foreground">{title}</h1>
              {subtitle && <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </header>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Opening document…</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onBack}>Back</Button>
              <Button
                onClick={() => {
                  nativeOpenAttemptedRef.current = null;
                  void openExternal(url).catch((err) => {
                    console.error("[DocumentReader] native browser retry failed", err);
                    setErrorMsg("Could not open this document.");
                  });
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        </div>
      );
    }


    return (
      <div
        ref={rootRef}
        className="fixed inset-0 bg-background flex flex-col overflow-hidden"
      >
        {/* Auto-hiding header */}
        <header
          onClick={showChrome}
          className={cn(
            "absolute top-0 left-0 right-0 z-30 bg-card/95 backdrop-blur border-b",
            "flex items-center gap-2 px-3 py-3 shadow-sm safe-area-top",
            "transition-transform duration-300 ease-out will-change-transform",
            chromeVisible ? "translate-y-0" : "-translate-y-full"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              if (document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => {});
              }
              onBack();
            }}
            aria-label="Go back"
            className="min-h-[44px] min-w-[44px]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-foreground line-clamp-1">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground line-clamp-1">{subtitle}</p>
            )}
          </div>
          {badge && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {badge}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleSave}
            aria-label={saved ? "Remove from Library" : "Save to Library"}
            aria-pressed={saved}
            className="min-h-[44px] min-w-[44px]"
          >
            {saved ? (
              <BookmarkCheck className="h-5 w-5 text-primary" />
            ) : (
              <Bookmark className="h-5 w-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            disabled={downloading || !url}
            aria-label="Download document"
            className="min-h-[44px] min-w-[44px]"
          >
            {downloading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Download className="h-5 w-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="min-h-[44px] min-w-[44px]"
          >
            {isFullscreen ? (
              <Minimize2 className="h-5 w-5" />
            ) : (
              <Maximize2 className="h-5 w-5" />
            )}
          </Button>

        </header>

        {/* Full-bleed document */}
        <div className="flex-1 flex flex-col w-full h-full relative">
          <PdfViewer
            key={`${url}#${retryNonce}`}
            url={url}
            title={title}
            filename={title}
            chromeVisible={false}
            onFirstByte={markPdfProgress}
            initialPage={initialPage}
            onPageChange={(p) => {
              // First page-change is still a safe fallback for markdown/older
              // viewer branches, but normal PDFs now clear on first byte.
              markPdfProgress();
              savePage(p);
            }}
          />
          {showSkeleton && !errorMsg && <ReaderSkeleton />}
          {errorMsg && (
            <ReaderErrorOverlay
              message={errorMsg}
              onRetry={handleRetry}
              onOpenExternal={handleOpenExternal}
            />
          )}
        </div>

        {/* Top-edge tap strip — only mounted when chrome hidden. 6px so it
            never blocks PDF scrolling near the top edge. */}
        {!chromeVisible && (
          <button
            type="button"
            aria-label="Show reader controls"
            onClick={showChrome}
            className="absolute top-0 left-0 right-0 h-1.5 z-40 bg-transparent safe-area-top focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:bg-primary/20"
          />
        )}
      </div>
    );
  }
);

DocumentReader.displayName = "DocumentReader";

export default DocumentReader;
