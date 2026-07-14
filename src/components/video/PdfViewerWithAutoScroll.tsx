import { useEffect, useRef, useState } from "react";
import PdfViewer, { type PdfViewerHandle } from "./PdfViewer";
import AutoScrollFab from "../viewer/AutoScrollFab";
import { useReaderChrome } from "../../hooks/useReaderChrome";
import { isGoogleDocs, isNotion } from "../../lib/pdfViewerUrl";


interface Props {
  url: string;
  title?: string;
  filename?: string;
  chromeVisible?: boolean;
  onDownloaded?: (info: { title: string; url: string; filename: string }) => void;
  onFirstByte?: () => void;
  /** FAB bottom offset in px (default 24 to sit just above the viewer bottom). */
  fabBottomOffset?: number;
  /** Page to restore on open (1-based). */
  initialPage?: number;
  /** Notified when the most-visible page changes (1-based). */
  onPageChange?: (page: number) => void;
  /** Fires once when the active reader surface is ready. */
  onReady?: () => void;
}

/**
 * Wraps PdfViewer + AutoScrollFab. Auto-hides the FAB after 2.5s of idle
 * (matches reader-mode chrome behaviour). Tap or scroll brings it back.
 */
export default function PdfViewerWithAutoScroll({
  url,
  title,
  filename,
  chromeVisible = true,
  onDownloaded,
  onFirstByte,
  fabBottomOffset = 24,
  initialPage,
  onPageChange,
  onReady,
}: Props) {
  const viewerRef = useRef<PdfViewerHandle>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [, force] = useState(0);
  const chrome = useReaderChrome(2500);

  // Sync the imperative refs into local refs the hook can read.
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const tick = () => {
      if (!alive) return;
      const s = viewerRef.current?.getScrollEl() ?? null;
      const i = viewerRef.current?.getIframeEl() ?? null;
      const changed = s !== scrollRef.current || i !== iframeRef.current;
      scrollRef.current = s;
      iframeRef.current = i;
      if (changed) force((n) => n + 1);
      if (++tries < 40 && !s && !i) setTimeout(tick, 100);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [url]);

  // Reveal chrome on any scroll inside the reader.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => chrome.show();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef.current]);

  return (
    <div className={chromeVisible ? "relative h-full w-full" : "absolute inset-0"}>
      <PdfViewer
        ref={viewerRef}
        url={url}
        title={title}
        filename={filename || title}
        chromeVisible={chromeVisible}
        onDownloaded={onDownloaded}
        onSurfaceTap={chrome.toggle}
        onFirstByte={onFirstByte}
        initialPage={initialPage}
        onPageChange={onPageChange}
        onReady={onReady}
      />
      {/* Hide FAB only for non-PDF web documents. Drive PDFs are single-path
          proxied canvas now, so autoscroll is always available there. */}
      {(() => {
        const hideFab = isGoogleDocs(url) || isNotion(url);
        if (hideFab) return null;
        return (
          <div
            className={`transition-opacity duration-300 ${
              chrome.visible ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <AutoScrollFab
              targetRef={scrollRef}
              iframeRef={iframeRef}
              bottomOffset={fabBottomOffset}
              onActiveChange={chrome.setPinned}
            />
          </div>
        );
      })()}

    </div>
  );
}
