import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookMarked, BookOpen, Download, Loader2, NotebookPen, X } from "lucide-react";
import RotatePhoneIcon from "../icons/RotatePhoneIcon";
import { Button } from "../ui/button";
import PdfViewer, { type PdfViewerHandle } from "../video/PdfViewer";
import AutoScrollFab from "../viewer/AutoScrollFab";
import NotesPanel from "./reader/NotesPanel";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { useIsMobile } from "../../hooks/use-mobile";
import { downloadFile } from "../../utils/fileUtils";
import { getReadingPage, setReadingPage } from "../../services/libraryNotes";
import { addBreadcrumb } from "../../lib/sentry";
import { toast } from "sonner";
import { addUrlToDefaultLibrary } from "../../services/personalLibrary";
import { lockOrientation, unlockOrientation } from "../../lib/screenOrientation";

interface Props {
  url: string;
  title: string;
  filename?: string;
  onBack: () => void;
  hideDownload?: boolean;
  onDownloaded?: () => void;
  /** Stable id used to persist reading position + notes. Enables the Notes panel. */
  itemId?: string;
  /** Where this PDF came from (telemetry). */
  source?: "library" | "downloads" | "attachment" | "other";
  /** Resolve a [[wikilink]] note name to a new doc to open. */
  onOpenLink?: (name: string) => void;
}

export default function DocReaderShell({
  url, title, filename, onBack, hideDownload, onDownloaded, itemId, source = "other", onOpenLink,
}: Props) {
  const [headerVisible, setHeaderVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [autoActive, setAutoActive] = useState(false);
  const isMobile = useIsMobile();
  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);
  const idleTimer = useRef<number | null>(null);
  const pageTimer = useRef<number | null>(null);
  const viewerRef = useRef<PdfViewerHandle>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const iframeElRef = useRef<HTMLIFrameElement | null>(null);

  const scheduleHide = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setHeaderVisible(false), 2500);
  };

  // Telemetry + restore saved reading position.
  useEffect(() => {
    addBreadcrumb("pdf", "open", { source, offline: /^(capacitor:|file:|blob:)/i.test(url), itemId });
    if (itemId) {
      getReadingPage(itemId).then((p) => setInitialPage(p > 1 ? p : undefined));
    }
  }, [url, itemId, source]);

  useEffect(() => {
    scheduleHide();
    return () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Release orientation lock on unmount only if we actually locked it.
  const landscapeRef = useRef(false);
  useEffect(() => { landscapeRef.current = landscape; }, [landscape]);
  useEffect(() => () => { if (landscapeRef.current) unlockOrientation().catch(() => {}); }, []);

  // Refresh refs as soon as the viewer reports readiness. Replaces the
  // earlier 150ms-interval poll: onReady is fired by PdfViewer after the
  // FastPdfReader scrollEl mounts OR after the fallback iframe `load` event,
  // so AutoScroll attaches to the right element on the first try.
  const refreshRefs = useCallback(() => {
    scrollElRef.current = viewerRef.current?.getScrollEl() ?? null;
    iframeElRef.current = viewerRef.current?.getIframeEl() ?? null;
  }, []);
  useEffect(() => {
    refreshRefs();
  }, [url, refreshRefs]);

  const handlePageChange = useCallback(
    (page: number) => {
      if (!itemId) return;
      if (pageTimer.current) window.clearTimeout(pageTimer.current);
      pageTimer.current = window.setTimeout(() => setReadingPage(itemId, page), 500);
    },
    [itemId]
  );

  const handleSurfaceTap = () => {
    // Single tap reveals/hides chrome + FABs (rotate, autoscroll, save).
    // Works in reading mode too so users can quickly access controls without
    // exiting reading mode.
    setHeaderVisible((v) => {
      const next = !v;
      if (next) scheduleHide();
      return next;
    });
  };

  const toggleReadingMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReadingMode((v) => {
      const next = !v;
      if (next) {
        setHeaderVisible(false);
        if (idleTimer.current) window.clearTimeout(idleTimer.current);
      } else {
        setHeaderVisible(true);
        scheduleHide();
      }
      return next;
    });
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    const t = toast.loading("Saving to device…");
    try {
      await downloadFile(url, filename || title);
      toast.success("Saved", { id: t });
      onDownloaded?.();
    } catch (err) {
      toast.error((err as Error)?.message || "Save failed — check your connection.", { id: t });
    } finally {
      setSaving(false);
    }
  };

  const handleAddToLibrary = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (savingLibrary) return;
    setSavingLibrary(true);
    const t = toast.loading("Adding to My Library…");
    try {
      await addUrlToDefaultLibrary(url, filename || title);
      toast.success("Added to My Library · folder \"Saved PDFs\"", { id: t });
      try { window.dispatchEvent(new Event("personalLibrary:refresh")); } catch { /* ignore */ }
      onDownloaded?.();
    } catch (err) {
      toast.error((err as Error)?.message || "Could not add to My Library", { id: t });
    } finally {
      setSavingLibrary(false);
    }
  };

  // Show "Add to My Library" anywhere except when the doc is already a Library item.
  const showAddToLibrary = source !== "library";

  return (
    <div className="fixed inset-0 z-50 flex bg-background">
      {/* Center column */}
      <div className="relative flex min-w-0 flex-1 flex-col" onClick={handleSurfaceTap}>
        <header
          className={`safe-area-top absolute left-0 right-0 top-0 z-30 flex min-h-[48px] items-center gap-2 border-b bg-card/95 px-3 shadow-sm backdrop-blur transition-transform duration-300 ${
            headerVisible ? "translate-y-0" : "-translate-y-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
          {showAddToLibrary && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleAddToLibrary}
              disabled={savingLibrary}
              aria-label="Add to My Library"
              title="Add to My Library"
            >
              {savingLibrary ? <Loader2 className="h-5 w-5 animate-spin" /> : <BookMarked className="h-5 w-5" />}
            </Button>
          )}
          {itemId && (
            <Button
              variant={notesOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setNotesOpen((v) => !v)}
              aria-label="Toggle notes"
            >
              <NotebookPen className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant={readingMode ? "secondary" : "ghost"}
            size="icon"
            onClick={toggleReadingMode}
            aria-label="Reading mode"
            title="Reading mode (sepia, distraction-free)"
          >
            <BookOpen className="h-5 w-5" />
          </Button>
        </header>

        {/* Eye-comfort sepia overlay — sits above the PDF, ignores pointer events. */}
        {readingMode && (
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{ backgroundColor: "rgba(244, 208, 144, 0.18)", mixBlendMode: "multiply" }}
            aria-hidden="true"
          />
        )}

        {/* In reading mode the only way back to chrome is to tap the page —
            we removed the distracting "Reading" pill. Tap reveals the header
            which contains the BookOpen toggle. */}

        {/* PDF surface — offset only while the floating header is visible so
            the first page never sits under the header/notch. When the header
            auto-hides we collapse fully to top:0 (full-bleed under the status
            bar) — the previous safe-area-inset-top offset left a visible
            ~24–48 px white strip above the PDF on notched devices. */}
        <div
          className="absolute inset-x-0 bottom-0 bg-background transition-[top] duration-300"
          style={{
            top: headerVisible
              ? "calc(env(safe-area-inset-top, 0px) + 48px)"
              : "0px",
          }}
        >
          <PdfViewer
            ref={viewerRef}
            url={url}
            title={title}
            filename={filename || title}
            chromeVisible={false}
            initialPage={initialPage}
            onPageChange={handlePageChange}
            onReady={refreshRefs}
          />
        </div>

        {/* AutoScroll FAB — auto-hides with chrome so the page is distraction-free
            while reading. Stays visible while autoscroll is active so the user
            can hold-to-pause or stop it. */}
        <div
          className={`transition-opacity duration-300 ${
            headerVisible || autoActive ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <AutoScrollFab
            targetRef={scrollElRef}
            iframeRef={iframeElRef}
            bottomOffset={hideDownload ? 24 : 84}
            onActiveChange={(a) => {
              setAutoActive(a);
              if (a) setHeaderVisible(false);
            }}
          />
        </div>

        {/* Rotate FAB — lightweight SVG only, no black pill background. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const next = !landscape;
            setLandscape(next);
            if (next) lockOrientation("landscape"); else unlockOrientation();
            scheduleHide();
          }}
          aria-label={landscape ? "Exit landscape" : "Rotate to landscape"}
          aria-pressed={landscape}
          title="Rotate to landscape"
          className={`safe-area-bottom fixed left-4 z-40 p-2 text-foreground transition-all duration-300 active:scale-95 ${
            hideDownload ? "bottom-5" : "bottom-[84px]"
          } ${headerVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <RotatePhoneIcon className={`h-7 w-7 transition-transform drop-shadow-md ${landscape ? "rotate-90" : ""}`} />
        </button>


        <div
          className={`transition-opacity duration-300 ${
            headerVisible && !readingMode ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {!hideDownload && (
            <button
              type="button"
              onClick={handleSave}
              aria-label="Save to device"
              className="safe-area-bottom fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/10 transition-transform active:scale-95"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Notes — right panel on desktop, bottom sheet on mobile */}
      {itemId && notesOpen && !isMobile && (
        <aside className="flex w-[320px] shrink-0 flex-col border-l">
          <NotesPanel itemId={itemId} title={title} onOpenLink={onOpenLink} />
        </aside>
      )}
      {itemId && isMobile && (
        <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
          <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl p-0">
            <SheetTitle className="sr-only">Notes</SheetTitle>
            <div className="flex items-center justify-end p-2">
              <Button variant="ghost" size="icon" onClick={() => setNotesOpen(false)} aria-label="Close notes">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="h-[calc(70vh-48px)]">
              <NotesPanel itemId={itemId} title={title} onOpenLink={onOpenLink} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
