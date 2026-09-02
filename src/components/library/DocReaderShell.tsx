import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookMarked, BookOpen, Download, Loader2, Maximize2, Minimize2, NotebookPen, Search, X } from "lucide-react";

import RotatePhoneIcon from "../icons/RotatePhoneIcon";
import { Button } from "../ui/button";
import PdfViewer, { type PdfViewerHandle } from "../video/PdfViewer";
import ReaderOverlays from "../viewer/ReaderOverlays";
import ReaderZoomControls from "./reader/ReaderZoomControls";
import { usePdfZoomControlsEnabled } from "@/hooks/usePdfZoomSettings";

/* Search is only parsed once the magnifier is tapped — it must never sit in
   the chunk that has to load before the first page paints. */
const ReaderSearchBar = lazyWithRetry(() => import("./reader/ReaderSearchBar")) as typeof import("./reader/ReaderSearchBar").default;

/* The note composer (toolbar, markdown preview, Obsidian export) is only
   needed once the reader's note icon is tapped, so it stays out of the chunk
   that has to parse before the first PDF page paints. */
const NotesPanel = lazyWithRetry(() => import("./reader/NotesPanel")) as typeof import("./reader/NotesPanel").default;
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { useIsMobile } from "../../hooks/use-mobile";
import { downloadFile } from "../../utils/fileUtils";
import { SpokeSpinner } from "../ui/spoke-spinner";
import { getReadingPage, setReadingPage } from "../../services/libraryNotes";
import { addBreadcrumb } from "../../lib/sentry";
import { toast } from "sonner";
import { addUrlToDefaultLibrary } from "../../services/personalLibrary";
import { lockOrientation, unlockOrientation, shouldCssRotate, isViewportLandscape } from "../../lib/screenOrientation";
import { tapHaptic, selectionHaptic } from "../../lib/native/haptics";
import { hideStatusBar, showStatusBar, setStatusBarOverlay, setStatusBarBackground, applyStatusBarForTheme } from "../../lib/nativeChrome";
import { acquireReaderImmersive, enterImmersive } from "../../lib/androidImmersive";
import { useReaderFullscreen } from "../../hooks/useReaderFullscreen";
import { ROTATION_FRAME_ATTR, rotationFrameStyle, notifyPortalHostChanged } from "../../lib/rotationFrame";
import usePortalHost from "../../hooks/usePortalHost";
import useKeyboardInset from "../../hooks/useKeyboardInset";
import useOverlayBackClose from "../../hooks/useOverlayBackClose";

import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { notesSheetMetrics } from "../../lib/reader/notesSheetMetrics";

import { Toaster as ReaderToaster } from "../ui/sonner";


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
  /**
   * Translating the hidden header is not enough inside the pseudo-landscape
   * rotation frame: the translate runs along the ROTATED y-axis, which points
   * along the physical screen edge, so a slice of the bar stayed painted in the
   * physical top-left corner ("the chip that will not go away", most visible on
   * offline PDFs opened from Saved / My Library). Once the hide transition has
   * finished we take the header out of the layer tree entirely — nothing left
   * to leak. Re-mounted synchronously when the chrome comes back.
   */
  const [headerRetired, setHeaderRetired] = useState(false);
  useEffect(() => {
    if (headerVisible) {
      setHeaderRetired(false);
      return;
    }
    const t = window.setTimeout(() => setHeaderRetired(true), 320);
    return () => window.clearTimeout(t);
  }, [headerVisible]);
  const [saving, setSaving] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number>(0);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [landscape, setLandscape] = useState(false);
  /** True when the OS/browser refused the orientation lock and we rotate in CSS. */
  const [pseudoLandscape, setPseudoLandscape] = useState(false);
  const [autoActive, setAutoActive] = useState(false);
  /** In-reader text search (canvas reader only). */
  const [searchOpen, setSearchOpen] = useState(false);
  /** Committed zoom factor reported by the canvas reader (1 = fit width). */
  const [zoom, setZoom] = useState(1);
  const zoomControlsEnabled = usePdfZoomControlsEnabled();

  const isMobile = useIsMobile();
  /** Rotation frame / fullscreen element, so the Notes sheet rotates with the page. */
  const portalHost = usePortalHost();
  /** Lift the notes sheet above the soft keyboard so the textarea stays visible. */
  const keyboardInset = useKeyboardInset();
  /** Layout viewport height — re-measured on rotate so landscape gets its own sizing. */
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  useEffect(() => {
    const sync = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);
  const sheetMetrics = notesSheetMetrics(viewportHeight, keyboardInset);



  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);
  const idleTimer = useRef<number | null>(null);
  const pageTimer = useRef<number | null>(null);
  /** Timestamp of the last accepted surface tap — de-dupes the double path. */
  const lastTapRef = useRef(0);

  const viewerRef = useRef<PdfViewerHandle>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  // Real header height (safe-area padding + content). The surface used to be
  // offset by a hardcoded 48px, which is shorter than the actual header on
  // notched devices — the difference showed as a pale strip across the top.
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(48);
  useEffect(() => {
    if (!headerEl) return;
    const measure = () => setHeaderHeight(Math.round(headerEl.getBoundingClientRect().height) || 48);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(headerEl);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, [headerEl]);

  const readerIdRef = useRef(`library-reader:${itemId || url}:${Date.now()}:${Math.random().toString(36).slice(2)}`);
  const readerId = readerIdRef.current;
  const { isFullscreen, toggleFullscreen } = useReaderFullscreen(shellRef);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const iframeElRef = useRef<HTMLIFrameElement | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);


  // Android hardware-back sentinel: push a history entry on open so the
  // global useAndroidBackButton hook pops us via popstate instead of
  // navigating the enclosing route (Library/Downloads/etc.).
  useEffect(() => {
    try { window.history.pushState({ pdfFullscreen: true }, ""); } catch {}
    const onPop = () => { try { onBack(); } catch {} };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      try {
        if (window.history.state?.pdfFullscreen) {
          window.history.replaceState({ ...(window.history.state || {}), pdfFullscreen: false }, "");
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hide the global bottom tab bar while the PDF viewer is open.
  // GlobalBottomNav watches this body attribute via MutationObserver.
  useEffect(() => {
    document.body.setAttribute("data-reader-open", "true");
    return () => {
      document.body.removeAttribute("data-reader-open");
    };
  }, []);

  // Kill the white status-bar strip on Android while the reader is open.
  // Matches the video-player behaviour (see useVideoStatusBarHide). Web is
  // a no-op; always restore on unmount so navigating away can never leave
  // the app in hidden-chrome state.
  useEffect(() => {
    // Overlay mode: if Android reveals a transient bar (edge swipe) it floats
    // over the page instead of shrinking the WebView and re-adding a strip.
    void setStatusBarOverlay(true);
    void setStatusBarBackground("#000000");
    void hideStatusBar();
    const releaseImmersive = acquireReaderImmersive();

    // Android restores the system bars on rotation / resume / focus, which
    // brought the white strip back at the top in landscape. Re-apply the hide
    // on every orientation, viewport, focus or visibility change (debounced —
    // resize fires per frame during the rotation animation).
    let t: number | null = null;
    const reapply = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        void hideStatusBar();
        enterImmersive();
      }, 120);
    };
    const onVisible = () => { if (document.visibilityState === "visible") reapply(); };
    window.addEventListener("orientationchange", reapply);
    window.addEventListener("resize", reapply);
    window.addEventListener("focus", reapply);
    window.visualViewport?.addEventListener("resize", reapply);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener("orientationchange", reapply);
      window.removeEventListener("resize", reapply);
      window.removeEventListener("focus", reapply);
      window.visualViewport?.removeEventListener("resize", reapply);
      document.removeEventListener("visibilitychange", onVisible);
      void showStatusBar();
      void setStatusBarOverlay(false);
      void applyStatusBarForTheme(
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
      releaseImmersive();
    };
  }, []);

  // While the reader is rotated in CSS, toasts must render inside the rotated
  // frame (see below) — hide the global <body>-level toaster so they don't
  // appear twice, once sideways.
  useEffect(() => {
    if (!pseudoLandscape) return;
    document.body.setAttribute("data-reader-rotated", "true");
    return () => { document.body.removeAttribute("data-reader-rotated"); };
  }, [pseudoLandscape]);

  /** Search must never auto-hide under the user's thumb mid-query. */
  const searchOpenRef = useRef(false);
  useEffect(() => { searchOpenRef.current = searchOpen; }, [searchOpen]);
  const scheduleHide = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (searchOpenRef.current) return;
      setHeaderVisible(false);
    }, 2500);
  };

  // Keep the toolbar pinned for as long as the search bar is open.
  useEffect(() => {
    if (!searchOpen) return;
    setHeaderVisible(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
  }, [searchOpen]);

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
  }, [url]);

  // Release orientation lock on unmount only if we actually locked it.
  const landscapeRef = useRef(false);
  useEffect(() => { landscapeRef.current = landscape; }, [landscape]);
  useEffect(() => () => { if (landscapeRef.current) unlockOrientation().catch(() => {}); }, []);


  useEffect(() => {
    setHeaderVisible(!isFullscreen);
  }, [isFullscreen]);

  // ── Rotate FAB ──────────────────────────────────────────────────────────
  // `lockOrientation` resolves false on desktop/most mobile browsers (no
  // Screen Orientation lock outside fullscreen). Fall back to a CSS rotation
  // of the reader surface so the button always does something visible.
  const toggleLandscape = useCallback(async () => {
    const next = !landscapeRef.current;
    setLandscape(next);
    landscapeRef.current = next;
    if (!next) {
      setPseudoLandscape(false);
      await unlockOrientation().catch(() => {});
      return;
    }
    const locked = await lockOrientation("landscape").catch(() => false);
    // Only rotate in CSS when the viewport is STILL portrait. If the device
    // really rotated, an extra CSS rotation sizes the surface to the short
    // screen edge → narrow page with white space on both sides.
    const w = window.visualViewport?.width ?? window.innerWidth;
    const h = window.visualViewport?.height ?? window.innerHeight;
    setPseudoLandscape(shouldCssRotate(locked, w, h));
  }, []);

  // The real rotation can land a few hundred ms after the lock call resolves
  // (and the user can also rotate the phone by hand). Drop the CSS rotation
  // as soon as the viewport itself is landscape.
  useEffect(() => {
    if (!pseudoLandscape) return;
    const check = () => { if (isViewportLandscape()) setPseudoLandscape(false); };
    check();
    window.addEventListener("orientationchange", check);
    window.addEventListener("resize", check);
    window.visualViewport?.addEventListener("resize", check);
    return () => {
      window.removeEventListener("orientationchange", check);
      window.removeEventListener("resize", check);
      window.visualViewport?.removeEventListener("resize", check);
    };
  }, [pseudoLandscape]);

  // The rotation frame appears/disappears → floating overlays (autoscroll FAB,
  // page chip) must re-portal into it, and the PDF surface must re-measure
  // against the swapped axes. Both happen after paint so the frame exists in
  // the DOM when the portal re-resolves. Single timer, always cleared.
  useEffect(() => {
    notifyPortalHostChanged();
    const t = window.setTimeout(() => {
      notifyPortalHostChanged();
      try { window.dispatchEvent(new Event("resize")); } catch { /* ignore */ }
    }, 220);
    return () => window.clearTimeout(t);
  }, [pseudoLandscape]);

  // Fullscreen enter/exit changes the available box; re-measure once the
  // transition settles so a locally-stored (My Library) document goes truly
  // edge-to-edge instead of keeping the pre-fullscreen letterbox.
  useEffect(() => {
    const t = window.setTimeout(() => {
      notifyPortalHostChanged();
      try { window.dispatchEvent(new Event("resize")); } catch { /* ignore */ }
    }, 260);
    return () => window.clearTimeout(t);
  }, [isFullscreen]);

  // Showing/hiding the floating header changes the surface box by the header
  // height (`top` animates over 300ms). Re-measure after the transition so the
  // rendered page refills the reclaimed strip instead of leaving a blank band
  // where the header used to be. Scheduled onto an idle frame (like
  // useReaderFullscreen does) so repeated taps can't queue a chain of PDF
  // canvas re-rasterises on low-RAM Android devices.
  useEffect(() => {
    let idleId: number | null = null;
    const t = window.setTimeout(() => {
      const fire = () => {
        notifyPortalHostChanged();
        try { window.dispatchEvent(new Event("resize")); } catch { /* ignore */ }
      };
      const ric = (window as unknown as {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      }).requestIdleCallback;
      if (typeof ric === "function") idleId = ric(fire, { timeout: 300 });
      else idleId = requestAnimationFrame(fire);
    }, 320);
    return () => {
      window.clearTimeout(t);
      if (idleId !== null) {
        const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        if (typeof cic === "function") cic(idleId);
        else cancelAnimationFrame(idleId);
      }
    };
  }, [headerVisible, landscape]);





  // Android hardware back must close the reader overlay itself, not navigate
  // the page underneath. Callers like Downloads / FolderView already register
  // their own sentinel, but StudyMaterialsList and LessonAttachmentsSheet do
  // not — owning one here gives every caller the overlay back contract.
  // Hardware back closes the search bar first, then the reader itself.
  const handleBack = useCallback(() => {
    if (searchOpen) {
      setSearchOpen(false);
      return;
    }
    onBack();
  }, [onBack, searchOpen]);
  useOverlayBackClose(true, handleBack, "doc-reader");

  // While the reader is mounted, kill the body's safe-area gutters and force a
  // black page background. Otherwise the light theme's white body shows through
  // in the status-bar / notch band as a white strip above the PDF.
  useEffect(() => {

    document.body.classList.add("nb-doc-reader-open");
    return () => document.body.classList.remove("nb-doc-reader-open");
  }, []);

  // Abort any in-flight download on unmount / back so the fetch stops
  // burning bandwidth after the reader closes.
  useEffect(() => () => {
    try { downloadAbortRef.current?.abort(); } catch { /* ignore */ }
  }, []);


  // Refresh refs as soon as the viewer reports readiness. Replaces the
  // earlier 150ms-interval poll: onReady is fired by PdfViewer after the
  // FastPdfReader scrollEl mounts OR after the fallback iframe `load` event,
  // so AutoScroll attaches to the right element on the first try.
  // Bumped whenever the resolved surface changes so ref-consuming children
  // (PageIndicatorPill attaches its scroll listener in an effect) re-run.
  const [surfaceTick, setSurfaceTick] = useState(0);
  const refreshRefs = useCallback(() => {
    const s = viewerRef.current?.getScrollEl() ?? null;
    const i = viewerRef.current?.getIframeEl() ?? null;
    const changed = s !== scrollElRef.current || i !== iframeElRef.current;
    scrollElRef.current = s;
    iframeElRef.current = i;
    if (changed) setSurfaceTick((n) => n + 1);
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
    //
    // The same physical tap can reach us twice: once via `onSurfaceTap` on the
    // PDF surface (needed for local blob:/capacitor: files, whose canvas taps
    // don't bubble reliably in the Android WebView) and once via the rotation
    // frame's onClick when the click DOES bubble (online PDFs / web preview).
    // Without this guard the header toggled off and instantly back on, so the
    // tap looked dead. Collapse both into one toggle per gesture.
    const now = Date.now();
    if (now - lastTapRef.current < 350) return;
    lastTapRef.current = now;
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
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setSaving(true);
    setDownloadPercent(0);
    const t = toast.loading("Saving to device…");
    const baseName = filename || title || "document";
    const safeName = /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : `${baseName}.pdf`;
    try {
      await downloadFile(
        url,
        safeName,
        ({ percent }) => setDownloadPercent(percent),
        controller.signal,
      );
      if (controller.signal.aborted) { toast.dismiss(t); return; }
      toast.success("Saved", { id: t });
      onDownloaded?.();
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") { toast.dismiss(t); }
      else {
        // Never leave the tap with nothing happening — hand the file off to the
        // system browser / download manager as a last resort.
        try {
          const { openResource } = await import("../../lib/openResource");
          await openResource({ url, kind: "link" });
          toast.success("Opening file…", { id: t });
        } catch {
          toast.error((err as Error)?.message || "Save failed — check your connection.", { id: t });
        }
      }
    } finally {
      setSaving(false);
      setDownloadPercent(0);
      if (downloadAbortRef.current === controller) downloadAbortRef.current = null;
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
    <div ref={shellRef} className="nb-reader-surface fixed inset-0 z-[60] flex motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150" data-testid="doc-reader-shell">
      {/* Opaque band behind the status bar / notch. Without it a white strip
          from the page background bleeds through above the PDF (browser and
          Capacitor WebView alike). Not inside the rotation frame on purpose.

          Rendered ONLY in portrait while the chrome is visible:
          - once the chrome hides, the PDF surface collapses to top:0 and a
            leftover band would cover the first lines of the page;
          - in landscape (native lock or CSS rotation) the notch inset is along
            the side, so a band across the physical top is exactly the strip
            reported as "the header does not hide all the way". */}
      {headerVisible && !landscape && !pseudoLandscape && (
        <div
          aria-hidden="true"
          data-testid="reader-notch-band"
          className="pointer-events-none fixed inset-x-0 top-0 z-[75] bg-black"
          style={{ height: "env(safe-area-inset-top, 0px)" }}
        />
      )}
      {/* Center column — this is also the pseudo-landscape rotation frame, so
          header, PDF surface, FABs and the page chip all rotate together. */}
      <div
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
        style={rotationFrameStyle(pseudoLandscape)}
        {...(pseudoLandscape ? { [ROTATION_FRAME_ATTR]: "true" } : {})}
        onClick={handleSurfaceTap}
      >

        <header
          ref={setHeaderEl}
          data-testid="reader-header"
          // z-50 keeps the toolbar above the save-progress overlay (z-40) and
          // every viewer overlay, so its controls never go dead mid-download.
          // When hidden we ALSO fade + `invisible` it: on Android WebViews the
          // translate alone left a pale sliver of the bar's safe-area padding
          // across the top of locally-opened (offline) PDFs.
          className={`safe-area-top absolute left-0 right-0 top-0 z-50 flex min-h-[48px] items-center gap-2 border-b bg-card/95 px-3 shadow-sm backdrop-blur transition-[transform,opacity] duration-300 ${
            headerVisible
              ? "translate-y-0 opacity-100 pointer-events-auto"
              : "opacity-0 invisible pointer-events-none"
          }`}
          // Percentage translate resolves against the element's own box, and
          // inside the rotated frame Android WebViews rounded it down enough to
          // leave a hairline of the bar painted along the top edge. Move it by
          // its measured height PLUS the status-bar inset and a few extra px so
          // it is provably off-frame on every device — and once the transition
          // has run, drop it out of the layer tree with `display:none` so a
          // rotated frame cannot leak a slice of it into the physical corner.
          style={
            headerVisible
              ? undefined
              : {
                  transform: `translateY(calc(-${headerHeight + 8}px - env(safe-area-inset-top, 0px)))`,
                  ...(headerRetired ? { display: "none" as const } : {}),
                }
          }

          aria-hidden={!headerVisible}

          onClick={(e) => e.stopPropagation()}
        >

          <Button
            variant="ghost"
            size="icon"
            onClick={() => { void selectionHaptic(); onBack(); }}
            aria-label="Back"
            className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
          {showAddToLibrary && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { void tapHaptic("light"); handleAddToLibrary(e); }}
              disabled={savingLibrary}
              aria-label="Add to My Library"
              title="Add to My Library"
              className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
            >
              {savingLibrary ? <Loader2 className="h-5 w-5 animate-spin" /> : <BookMarked className="h-5 w-5" />}
            </Button>
          )}
          {itemId && (
            <Button
              variant={notesOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={() => { void selectionHaptic(); setNotesOpen((v) => !v); }}
              aria-label="Toggle notes"
              className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
            >
              <NotebookPen className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant={searchOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={() => {
              void selectionHaptic();
              setSearchOpen((v) => !v);
              setHeaderVisible(true);
            }}
            aria-label="Search in document"
            aria-pressed={searchOpen}
            title="Search in document"
            className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button
            variant={readingMode ? "secondary" : "ghost"}
            size="icon"
            onClick={(e) => { void selectionHaptic(); toggleReadingMode(e); }}
            aria-label="Reading mode"
            title="Reading mode (sepia, distraction-free)"
            className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
          >
            <BookOpen className="h-5 w-5" />
          </Button>
          <Button
            variant={isFullscreen ? "secondary" : "ghost"}
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              void selectionHaptic();
              toggleFullscreen();
            }}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-pressed={isFullscreen}
            title="Fullscreen"
            className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
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
          className="nb-reader-surface absolute inset-x-0 bottom-0 transition-[top] duration-300"
          style={{
            // In landscape the page stays full-bleed at top:0 — the floating
            // header carries its own safe-area padding, and the offset used to
            // leave a white strip across the top. Measured header height — a
            // hardcoded 48px was shorter than the real header on notched
            // devices, leaving a pale strip. The pseudo-landscape rotation now
            // lives on the frame (parent), never on this surface.
            top:
              searchOpen && !landscape
                ? `${headerHeight + 56}px`
                : headerVisible && !landscape
                  ? `${headerHeight}px`
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
            onZoomChange={setZoom}
            // Explicit tap forwarding: locally-opened (blob:/capacitor:) PDFs
            // render inside the canvas surface, whose taps were not reaching
            // the frame's onClick — so the header never toggled offline.
            onSurfaceTap={handleSurfaceTap}
            readerId={readerId}
          />

        </div>

        {/* Reader overlays — autoscroll FAB + Drive-style page pill.
            `surfaceTick` remounts them once the viewer surface resolves so the
            pill's scroll listener attaches to the real element. */}
        <ReaderOverlays
          key={`overlays-${surfaceTick}`}
          targetRef={scrollElRef}
          iframeRef={iframeElRef}
          docKey={itemId || url}
          bottomOffset={hideDownload ? 96 : 84}
          visible={headerVisible || autoActive}
          onActiveChange={(a) => {
            setAutoActive(a);
            if (a) setHeaderVisible(false);
          }}
          pinned={headerVisible && !readingMode}
        />

        {/* One-handed zoom controls — admin-gated (default OFF).
            Pinch and double-tap always work; zoom never goes below 100%. */}
        {zoomControlsEnabled && <ReaderZoomControls
          zoom={zoom}
          visible={headerVisible && !readingMode && !searchOpen}
          onZoomBy={(factor) => viewerRef.current?.zoomBy(factor)}
          onFitWidth={() => viewerRef.current?.fitWidth()}
        />}

        {searchOpen && (
          <Suspense fallback={null}>
            <ReaderSearchBar
              topOffset={headerHeight}
              onClose={() => setSearchOpen(false)}
              onSearch={async (q) => (await viewerRef.current?.findPages(q)) ?? []}
              onJump={(page) => viewerRef.current?.goToPage(page)}
            />
          </Suspense>
        )}


        {/* Rotate FAB — lightweight SVG only, no black pill background. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleLandscape();
            scheduleHide();
          }}

          aria-label={landscape ? "Exit landscape" : "Rotate to landscape"}
          aria-pressed={landscape}
          title="Rotate to landscape"
          style={{ bottom: hideDownload ? "calc(env(safe-area-inset-bottom, 0px) + 20px)" : "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
          className={`fixed left-4 z-40 p-2 text-foreground transition-all duration-300 active:scale-95 ${headerVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
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
            onClick={(e) => { void tapHaptic("light"); handleSave(e); }}
              aria-label="Save to device"
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            className="fixed right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/10 transition-transform duration-150 ease-out active:scale-[0.94]"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            </button>
          )}
        </div>

        {/* Download progress overlay — mirrors ReaderProgress styling so
            the user always sees a moving percent + bar while saving. */}
        {saving && (
          <div
            aria-busy="true"
            aria-label={`Saving — ${downloadPercent}%`}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <SpokeSpinner />
            <p className="text-sm text-muted-foreground text-center px-6 max-w-xs tabular-nums">
              Saving “{title.length > 40 ? `${title.slice(0, 40)}…` : title}” — {downloadPercent}%
            </p>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${downloadPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Reader-scoped toaster: lives inside the rotation frame so toasts are
            upright and on-screen in pseudo-landscape. The global one is hidden
            via body[data-reader-rotated] to avoid a sideways duplicate. */}
        {pseudoLandscape && <ReaderToaster />}
      </div>

      {/* Notes — right panel on desktop, bottom sheet on mobile */}
      {itemId && notesOpen && !isMobile && (
        <aside className="flex w-[320px] shrink-0 flex-col border-l">
          <NotesPanel itemId={itemId} title={title} onOpenLink={onOpenLink} keyboardInset={keyboardInset} />
        </aside>
      )}
      {itemId && isMobile && (
        <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
          <SheetContent
            side="bottom"
            container={portalHost}
            // The reader shell is `z-[60]`; when the sheet portals to <body>
            // (the normal, non-fullscreen case) the default `z-50` puts it
            // *behind* the reader — the note surface simply never appeared.
            overlayClassName="z-[78]"
            style={{
              zIndex: 79,
              // Lift the sheet clear of the soft keyboard and clamp its height
              // so a transient over-large inset can never collapse the writing
              // surface. See `notesSheetMetrics` for the guarantees.
              bottom: sheetMetrics.bottom,
              height: sheetMetrics.height,
              maxHeight: sheetMetrics.height,
              // Notch / rounded corners in landscape, home indicator in
              // portrait — only pad the bottom when the keyboard is not
              // already covering that area.
              paddingLeft: "env(safe-area-inset-left, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
              paddingBottom: keyboardInset > 0 ? 0 : "env(safe-area-inset-bottom, 0px)",
            }}

            className="flex flex-col rounded-t-2xl p-0 [&>button:last-child]:hidden"
          >
            <SheetTitle className="sr-only">Notes</SheetTitle>

            {/* PW-style floating close button, centred just above the sheet */}
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              aria-label="Close notes"
              className="nb-tap-exempt absolute -top-[52px] left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-foreground shadow-lg active:scale-95 transition-transform"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Grab handle */}
            <div className="flex shrink-0 justify-center pb-1 pt-2">
              <span className="h-1 w-9 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="min-h-0 flex-1">
              <Suspense
                fallback={
                  <div className="space-y-3 p-4" aria-hidden>
                    <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  </div>
                }
              >
              <NotesPanel
                itemId={itemId}
                title={title}
                onOpenLink={onOpenLink}
                keyboardInset={keyboardInset}
                onClose={() => setNotesOpen(false)}
              />
              </Suspense>
            </div>

          </SheetContent>
        </Sheet>
      )}


    </div>
  );
}
