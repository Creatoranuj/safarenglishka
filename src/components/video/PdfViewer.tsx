import { memo, useMemo, useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { ExternalLink, Loader2, BookOpen, Eye } from "lucide-react";
import { resolveEmbedUrl, isNaveenBharatStorage, isGithubStoragesCdn, isGoogleDrive, isGoogleDocs, isNotion, renderablePdfUrl, extractDriveFileId, googleDrivePdfProxyUrl } from "../../lib/pdfViewerUrl";
import MarkdownViewer, { type MarkdownViewerHandle } from "./MarkdownViewer";
import FastPdfReader, { type FastPdfReaderHandle } from "./FastPdfReader";
import { useScreenProtection } from "../../hooks/useScreenProtection";
import { useOfflineResolvedUrl } from "../../hooks/useOfflineResolvedUrl";
import { pushPlayerBusy } from "../../lib/playerBusy";
import { openExternal } from "../../lib/native/browser";
import NotionPageRenderer from "./NotionPageRenderer";

interface PdfViewerProps {
  url: string;
  title?: string;
  filename?: string;
  chromeVisible?: boolean;
  onSurfaceTap?: () => void;
  onFirstByte?: () => void;
  onDownloaded?: (info: { title: string; url: string; filename: string }) => void;
  /** Page to restore on open (1-based). */
  initialPage?: number;
  /** Notified when the most-visible page changes (1-based). */
  onPageChange?: (page: number) => void;
}

export type PdfViewerHandle = {
  getScrollEl: () => HTMLElement | null;
  getIframeEl: () => HTMLIFrameElement | null;
};

const isMarkdownUrl = (u: string) => /\.(md|markdown)(\?|#|$)/i.test(u);

/**
 * URLs that must stay as iframe embeds (we can't render them as canvas).
 * Google Drive and Google Docs are both cross-origin/CORS-blocked, so the
 * canvas FastPdfReader can't fetch their bytes — they MUST go through an
 * iframe (Drive's /preview or Docs' /preview).
 *
 * NOTE: local files (capacitor://, file://, ionic://, blob:, http://localhost
 * _capacitor_file_…) are intentionally NOT here — they render through
 * FastPdfReader (canvas) so offline autoscroll + large-PDF streaming work.
 */
const mustUseIframe = (u: string) =>
  isGoogleDocs(u) || isGoogleDrive(u);

/** localStorage key for per-Drive-file Reader Mode preference. */
const readerModeKey = (driveId: string) => `nb:reader-mode:${driveId}`;

const PdfViewerInner = forwardRef<PdfViewerHandle, PdfViewerProps>(
  ({ url: rawUrl, title, filename, chromeVisible = true, onSurfaceTap, onFirstByte, initialPage, onPageChange }, ref) => {
    useScreenProtection(true);
    useEffect(() => pushPlayerBusy(), []);

    // Prefer an offline-downloaded copy when one exists for this URL.
    const { url: offlineUrl } = useOfflineResolvedUrl(rawUrl);
    const url = useMemo(() => renderablePdfUrl(offlineUrl), [offlineUrl]);

    // ── All hooks declared up-front (rules-of-hooks) ────────────────────────
    const mdRef = useRef<MarkdownViewerHandle>(null);
    const pdfRef = useRef<FastPdfReaderHandle>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const isMd = isMarkdownUrl(url) || (!!filename && isMarkdownUrl(filename));

    // ── Reader Mode (Drive only) ─────────────────────────────────────────────
    // Default = Drive `/preview` iframe (zero edge load).
    // Opt-in = proxy → FastPdfReader (autoscroll, page restore, screen protection).
    const driveId = useMemo(() => (isGoogleDrive(url) ? extractDriveFileId(url) : null), [url]);
    const [readerMode, setReaderMode] = useState<boolean>(() => {
      if (!driveId) return false;
      try { return localStorage.getItem(readerModeKey(driveId)) === "1"; } catch { return false; }
    });
    const toggleReaderMode = useCallback(() => {
      setReaderMode((prev) => {
        const next = !prev;
        if (driveId) {
          try { localStorage.setItem(readerModeKey(driveId), next ? "1" : "0"); } catch {}
        }
        return next;
      });
    }, [driveId]);

    // When Reader Mode is on for a Drive file, route to proxy + FastPdfReader.
    const driveProxyUrl = useMemo(
      () => (driveId && readerMode ? googleDrivePdfProxyUrl(url) : null),
      [driveId, readerMode, url]
    );
    const effectiveUrl = driveProxyUrl ?? url;
    const useIframe = !isMd && mustUseIframe(effectiveUrl);

    useImperativeHandle(
      ref,
      () => ({
        getScrollEl: () =>
          mdRef.current?.getScrollEl() ?? pdfRef.current?.getScrollEl() ?? null,
        getIframeEl: () => iframeRef.current ?? pdfRef.current?.getIframeEl() ?? null,
      }),
      []
    );

    // iframe-branch state (safe to declare regardless of branch — React only
    // cares that the hook order is stable per component instance).
    const [loaded, setLoaded] = useState(false);
    const [showOpenExternal, setShowOpenExternal] = useState(false);
    const loadedRef = useRef(false);

    const resolved = useMemo(() => resolveEmbedUrl(effectiveUrl), [effectiveUrl]);
    const { isDrive } = resolved;
    const isHtmlViewer = isNaveenBharatStorage(url) || isGithubStoragesCdn(url);
    const embedUrl = resolved.embedUrl;

    // Show Reader Mode toggle for Drive files only (the only surface where
    // we have two viable rendering paths: free preview iframe vs proxied canvas).
    const showReaderToggle = !!driveId;

    useEffect(() => {
      if (!useIframe) return;
      setLoaded(false);
      loadedRef.current = false;
      setShowOpenExternal(false);
      const t = window.setTimeout(() => {
        if (!loadedRef.current) setShowOpenExternal(true);
      }, 10000);
      return () => window.clearTimeout(t);
    }, [embedUrl, useIframe]);

    // ── Notion branch — in-app native render via react-notion-x ─────────────
    // Notion blocks iframes (x-frame-options), so we fetch the page's
    // recordMap through our edge function and render it natively. Falls back
    // to "Open in Browser" card on any error.
    if (isNotion(url)) {
      return (
        <div
          className={
            chromeVisible
              ? "relative w-full overflow-hidden bg-card"
              : "absolute inset-0 w-full h-full overflow-hidden bg-card"
          }
          style={
            chromeVisible
              ? { height: "calc(100dvh - 176px + env(safe-area-inset-bottom))", minHeight: "60vh" }
              : undefined
          }
        >
          <NotionPageRenderer url={url} title={title} />
        </div>
      );
    }

    // ── Markdown branch ──────────────────────────────────────────────────────
    if (isMd) {
      return (
        <div
          className={
            chromeVisible
              ? "relative w-full overflow-hidden bg-card"
              : "absolute inset-0 w-full h-full overflow-hidden bg-card"
          }
          style={
            chromeVisible
              ? { height: "calc(100dvh - 176px + env(safe-area-inset-bottom))", minHeight: "60vh" }
              : undefined
          }

        >
          <MarkdownViewer ref={mdRef} url={url} title={title} />
        </div>
      );
    }

    // ── Fast native PDF branch (canvas, no iframe) ───────────────────────────
    if (!useIframe) {
      return (
        <div
          className={
            chromeVisible
              ? "relative w-full overflow-hidden bg-card landscape:!h-[calc(100dvh-var(--nb-player-h,56.25vw)-env(safe-area-inset-top)-env(safe-area-inset-bottom))] landscape:!min-h-[200px]"
              : "absolute inset-0 w-full h-full overflow-hidden bg-card"
          }
          style={
            chromeVisible
              ? { height: "calc(100dvh - 176px + env(safe-area-inset-bottom))", minHeight: "60vh" }
              : undefined
          }

        >
          <FastPdfReader
            ref={pdfRef}
            url={effectiveUrl}
            onSurfaceTap={onSurfaceTap}
            onFirstByte={onFirstByte}
            initialPage={initialPage}
            onPageChange={onPageChange}
          />
          {showReaderToggle && (
            <ReaderModeToggle active={readerMode} onToggle={toggleReaderMode} />
          )}
        </div>
      );
    }

    // ── Fallback iframe branch (Drive, Docs, Notion, custom viewer pages) ────
    const TOOLBAR_HIDE_PX = isDrive ? 72 : isHtmlViewer ? 56 : 0;

    const wrapperClass = chromeVisible
      ? "relative w-full overflow-hidden bg-card landscape:!h-[calc(100dvh-var(--nb-player-h,56.25vw)-env(safe-area-inset-top)-env(safe-area-inset-bottom))] landscape:!min-h-[200px]"
      : "absolute inset-0 w-full h-full overflow-hidden bg-card";

    const wrapperStyle: React.CSSProperties = chromeVisible
      ? {
          height: "calc(100dvh - 176px + env(safe-area-inset-bottom))",
          minHeight: "60vh",
          transition: "height 250ms ease",
        }
      : {};


    return (
      <div className={wrapperClass} style={wrapperStyle} onClick={onSurfaceTap}>
        <iframe
          ref={iframeRef}
          key={embedUrl}
          src={embedUrl}
          className="absolute left-0 w-full border-0"
          style={{ top: -TOOLBAR_HIDE_PX, height: `calc(100% + ${TOOLBAR_HIDE_PX}px)` }}
          title={title || "PDF Document"}
          allow="fullscreen"
          {...(isDrive ? { sandbox: "allow-scripts allow-same-origin allow-popups allow-forms" } : {})}
          loading="eager"
          onLoad={() => {
            loadedRef.current = true;
            setLoaded(true);
            try { window.dispatchEvent(new CustomEvent("pdf-ready")); } catch {}
          }}
        />
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card/90">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading PDF…</p>
            {showOpenExternal && (
              <button
                type="button"
                onClick={() => openExternal(url)}
                className="inline-flex items-center gap-1 text-xs text-primary underline"
              >
                <ExternalLink className="h-3 w-3" /> Open externally
              </button>
            )}
          </div>
        )}
        {showReaderToggle && (
          <ReaderModeToggle active={readerMode} onToggle={toggleReaderMode} />
        )}
      </div>
    );
  }
);

/**
 * Compact pill button shown over Drive PDFs. Lets the user opt into
 * "Reader Mode" (proxy + canvas → autoscroll, page restore, screen protection).
 * Default = off → preview iframe served by Google (zero edge load).
 */
function ReaderModeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background"
      title={active ? "Switch to fast preview (Google Drive)" : "Reader Mode: autoscroll + page restore"}
      aria-pressed={active}
    >
      {active ? <Eye className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
      <span>{active ? "Preview" : "Reader Mode"}</span>
    </button>
  );
}

/**
 * Notion page preview card. Notion sets `x-frame-options: SAMEORIGIN` so we
 * cannot embed it in an iframe. Instead we render a clean, branded "Open in
 * Notion" card — same UX pattern Substack/Medium/Twitter use for content
 * that can't be embedded. Tap → opens in system browser (or in-app browser
 * on Capacitor).
 */
function NotionPreviewCard({ url, title }: { url: string; title?: string }) {
  const displayTitle =
    title ||
    (() => {
      try {
        const slug = new URL(url).pathname.split("/").pop() || "";
        return slug.replace(/-[a-f0-9]{20,}$/i, "").replace(/-/g, " ").trim() || "Notion Page";
      } catch {
        return "Notion Page";
      }
    })();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground/[0.06] ring-1 ring-border">
        {/* Notion-style "N" mark, theme-aware via currentColor */}
        <svg viewBox="0 0 24 24" className="h-9 w-9 text-foreground" fill="none" aria-hidden="true">
          <path d="M5 4h11l3 3v13H5V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9 9v6m0-6l5 6m0-6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold leading-tight text-foreground">{displayTitle}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Notion pages open in your browser for the best reading experience — including images, links and rich formatting.
        </p>
      </div>
      <button
        type="button"
        onClick={() => openExternal(url)}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 active:opacity-80"
      >
        <ExternalLink className="h-4 w-4" />
        Open Notion Page
      </button>
      <p className="text-[11px] text-muted-foreground/70">notion.site</p>
    </div>
  );
}

PdfViewerInner.displayName = "PdfViewer";
const PdfViewer = memo(PdfViewerInner);
export default PdfViewer;
