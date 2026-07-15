import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { mark, measure } from "@/lib/perf/marks";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import UnifiedVideoPlayer from "../components/video/UnifiedVideoPlayer";

import { LoadingSpinner } from "../components/ui/loading-spinner";
import { SmartImage } from "../components/common/SmartImage";

import { formatDuration } from "../lib/videoUtils";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../components/ui/accordion";
import {
  ArrowLeft, Play, Lock, Clock,
  FileText, MessageCircle, CheckCircle, Send, Library, ImageIcon, X,
  HelpCircle, ChevronRight, ChevronDown, ChevronUp, Edit2, Save, Sparkles, ListVideo, Loader2, Target, Paperclip, MessageSquare, Star, ThumbsUp, Download, Bookmark as BookmarkIcon, Users, Phone, Mail, Bot, ExternalLink, Share2,
  Upload as UploadIcon, Link as LinkIcon, Trash2, BookOpen
} from "lucide-react";
import { Markdown } from "../components/Markdown";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";


import { extractArchiveId } from "../utils/fileUtils";
import { safeGet, safeSet } from "../lib/storage";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { openResource } from "../lib/openResource";
import { openExternal } from "../lib/native/browser";
import { isKnownNonPdfWebUrl, isLikelyPdfUrl } from "../lib/detectFileType";
import { isGoogleDocs, isNotion, isGoogleDrive, googleDrivePdfProxyUrl } from "../lib/pdfViewerUrl";
// openNativeDocument intentionally not imported — PDFs render in-app only.
import { useComments } from "../hooks/useComments";
import { useAuth } from "../contexts/AuthContext";
import { useNavigationHistory } from "../contexts/NavigationHistoryContext";
import { resolveFromParam } from "../config/backNavigation";
import { ArchiveBookList, type ArchiveBook } from "../components/archive";
import { Textarea } from "../components/ui/textarea";
import PdfViewer from "../components/video/LazyPdfViewer";
import { lazyWithRetry } from "../lib/lazyWithRetry";
const DocumentReader = lazyWithRetry(() => import("../components/course/DocumentReader"));
import VideoRecommendations from "../components/video/VideoRecommendations";
import PdfSelectPopup, { type PdfItem } from "../components/video/PdfSelectPopup";
import BookmarksPanel from "../components/video/BookmarksPanel";
import PdfIcon from "../components/common/PdfIcon";

import { useLessonLikes } from "../hooks/useLessonLikes";
import { useLessonPdfs } from "../hooks/useLessonPdfs";
import { useLessonAttachments } from "../hooks/useLessonAttachments";
import { useLessonProgress } from "../hooks/useLessonProgress";
import { AttachmentRow } from "../components/lesson/AttachmentRow";
import { useDownloads } from "../hooks/useDownloads";
import { useScreenProtection } from "../hooks/useScreenProtection";
import { pushPlayerBusy } from "../lib/playerBusy";
import { resolveDeepLinkPdf } from "../lib/resolveDeepLinkPdf";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../components/ui/collapsible";
import { notifySuccess } from "../lib/nativeChrome";
import { selectionHaptic } from "../lib/native/haptics";
import { readBundleSync, readBundle, writeBundle, rememberLastLesson, recallLastLesson, isOffline } from "../lib/perf/lessonViewCache";
import { AskDoubtSheet } from "../components/lesson/AskDoubtSheet";
import SmartNotesReader from "../components/notes/SmartNotesReader";
import ObsidianMarkdown from "../components/notes/ObsidianMarkdown";
import SmartNotesLinkDialog from "../components/notes/SmartNotesLinkDialog";
import SmartNotesListSheet from "../components/notes/SmartNotesListSheet";
import AutoScrollFab from "../components/viewer/AutoScrollFab";
import notesFireIcon from "../assets/icons/notes-fire.svg";
import { logger } from "@/lib/logger";
import { useLessonChat } from "@/hooks/useLessonChat";
// NOTE: `ChapterGroupedSidebar`, `LessonDescription`, `TopicsCovered` were
// previously nested inside this file but never rendered (dead code).
// They now live under `src/components/lesson/` for future reuse.

// Type definitions
interface Lesson {
  id: string;
  title: string;
  video_url: string;
  is_locked: boolean | null;
  description: string | null;
  overview: string | null;
  course_id: number | null;
  chapter_id: string | null;
  created_at: string | null;
  class_pdf_url: string | null;
  like_count: number | null;
  lecture_type: string | null;
  thumbnail_url: string | null;
  transcript_md?: string | null;
}

interface Chapter {
  id: string;
  code: string;
  title: string;
  parent_id?: string | null;
}

/** Collapsible PDF section for Overview tab */
function CollapsiblePdfSection({
  lessonPdfs,
  classPdfUrl,
  selectedPdf,
  onSelectPdf,
  onClosePdf,
}: {
  lessonPdfs: { id: string; file_name: string; file_url: string; file_size?: number | null }[];
  classPdfUrl?: string | null;
  selectedPdf: PdfItem | null;
  onSelectPdf: (pdf: PdfItem) => void;
  onClosePdf: () => void;
}) {
  const [open, setOpen] = useState(false);
  const count = lessonPdfs.length + (classPdfUrl ? 1 : 0);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Lecture Notes & PDFs</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{count}</Badge>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="divide-y divide-border">
          {classPdfUrl && (
            <button
              onClick={() => onSelectPdf({ id: 'class-pdf', file_name: 'Class PDF', file_url: classPdfUrl })}
              className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/10 transition-colors"
            >
              <PdfIcon className="h-9 w-9 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Class PDF</p>
                <p className="text-xs text-muted-foreground">Tap to view</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          {lessonPdfs.map((pdf) => (
            <button
              key={pdf.id}
              onClick={() => onSelectPdf({ id: pdf.id, file_name: pdf.file_name, file_url: pdf.file_url, file_size: pdf.file_size })}
              className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/10 transition-colors"
            >
              <PdfIcon className="h-9 w-9 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{pdf.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {pdf.file_size ? `${(pdf.file_size / 1024).toFixed(0)} KB` : 'Tap to view'}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}

          {/* Inline PDF viewer */}
          {selectedPdf && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 z-30 h-8 w-8 bg-background/80 backdrop-blur-sm rounded-full"
                onClick={onClosePdf}
              >
                <X className="h-4 w-4" />
              </Button>
              <PdfViewer url={selectedPdf.file_url} title={selectedPdf.file_name} filename={selectedPdf.file_name} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const LessonView = () => {
  // Android FLAG_SECURE while LessonView is mounted (no-op on web / if plugin absent)
  useScreenProtection(true);
  // Pause personal-library disk writes while the lesson player is mounted.
  useEffect(() => pushPlayerBusy(), []);


  // Support both URL params and query params
  const { courseId: paramCourseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryCourseId = searchParams.get("courseId");
  const lessonIdParam = searchParams.get("lessonId") || searchParams.get("lesson");
  const tokenParam = searchParams.get("token");
  const courseId = paramCourseId || queryCourseId;
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const navHistory = useNavigationHistory();

  // Safety net: if anything (player, PDF viewer) ever leaves the page locked,
  // always release on unmount / route change so scroll is never dead.
  useEffect(() => {
    return () => {
      document.body.classList.remove("nb-scroll-lock");
    };
  }, []);


  // State
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<any>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  
  // Video duration state - actual duration from player
  const [videoDuration, setVideoDuration] = useState(0);
  
  // Access Control
  const [hasPurchased, setHasPurchased] = useState(false);
  
  // Notes state (local storage based for persistence)
  const [noteContent, setNoteContent] = useState("");

  // Admin: Smart Notes (transcript_md) upload state
  const [smartNotesDraft, setSmartNotesDraft] = useState("");
  const [smartNotesEditing, setSmartNotesEditing] = useState(false);
  const [smartNotesSaving, setSmartNotesSaving] = useState(false);
  // Fullscreen Smart Notes reader (mirrors the PDF attachment reader UX).
  const [smartNotesOpen, setSmartNotesOpen] = useState(false);
  /** Selected user note id when opened via the multi-note picker. */
  const [smartNotesActiveId, setSmartNotesActiveId] = useState<string | null>(null);
  /** Multi-note picker sheet (add / rename / delete / open). */
  const [smartNotesSheetOpen, setSmartNotesSheetOpen] = useState(false);
  /** When opening from the inline "Reading mode" shortcut, the reader boots
   *  directly into sepia/theme mode for a distraction-light experience. */
  const [smartNotesReadingMode, setSmartNotesReadingMode] = useState<"off" | "theme">("off");
  /** Inline sepia reading toggle — applies to the in-page Smart Notes block
   *  WITHOUT opening the fullscreen reader. */
  const [inlineReadingMode, setInlineReadingMode] = useState(false);
  
  // Comment state
  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentImagePreview, setCommentImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Archive.org books state (stored per lesson in localStorage for now)
  const [archiveBooks, setArchiveBooks] = useState<ArchiveBook[]>([]);
  
  // Lesson overview override map (avoids page reload after admin saves topics)
  const [lessonOverviewMap, setLessonOverviewMap] = useState<Record<string, string>>({});
  
  // YouTube-style collapsible sections (controlled accordion)
  const [openSections, setOpenSections] = useState<string[]>(["overview"]);
  // Active pill-chip tab for lesson sections (Timeline / Attachment / Doubts / Resources).
  const [activeChip, setActiveChip] = useState<string>(() => searchParams.get("tab") || "comments");
  const tabsRef = useRef<HTMLDivElement>(null);
  const smartNotesEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [smartNotesImportProgress, setSmartNotesImportProgress] = useState<number | null>(null);
  const inlineNotesScrollRef = useRef<HTMLDivElement | null>(null);
  const [smartNotesDragOver, setSmartNotesDragOver] = useState(false);
  const [smartNotesLinkDialogOpen, setSmartNotesLinkDialogOpen] = useState(false);

  /** Shared URL importer used by the multi-link dialog. */
  const importUrlToDraft = useCallback(async (rawUrl: string) => {
    const parsed = new URL(rawUrl);
    // SSRF hardening: block non-HTTPS + private-network hosts. Capacitor
    // WebView on Android can otherwise reach 192.168.x.x / 10.x router UIs.
    if (parsed.protocol !== 'https:') {
      toast.error("Only HTTPS URLs are supported");
      return;
    }
    const host = parsed.hostname.toLowerCase();
    const BLOCKED = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|0\.0\.0\.0)/i;
    if (BLOCKED.test(host)) {
      toast.error("Local network URLs are not allowed");
      return;
    }
    setSmartNotesImportProgress(5);
    try {
      const res = await fetch(parsed.toString(), { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSmartNotesImportProgress(35);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const lower = parsed.pathname.toLowerCase();
      let appended = "";
      if (ct.startsWith("text/") || /\.(md|markdown|txt)$/.test(lower)) {
        appended = await res.text();
        setSmartNotesImportProgress(85);
      } else if (ct.includes("pdf") || lower.endsWith(".pdf")) {
        // OOM guard: cap remote PDF imports at 15 MB. Loading a 50 MB PDF as
        // an in-memory ArrayBuffer routinely crashes low-RAM Android WebViews.
        // UX fallback: surface a toast action to open the PDF externally
        // instead of importing (avoids dead-end for legit big textbooks).
        const openExternally = () => {
          // Native (Capacitor): opens in Chrome Custom Tabs / SFSafariViewController
          // so user never leaves the app. Web: standard window.open.
          openExternal(parsed.toString()).catch(() => { /* no-op */ });
        };
        const cl = Number(res.headers.get("content-length") || 0);
        if (cl && cl > 15 * 1024 * 1024) {
          toast.error("PDF too large (>15 MB)", {
            action: { label: "Open externally", onClick: openExternally },
          });
          throw new Error("PDF too large (>15 MB).");
        }
        const pdfjs: any = await import("pdfjs-dist");
        try {
          const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
          pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        } catch { /* worker set elsewhere */ }
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 15 * 1024 * 1024) {
          toast.error("PDF too large (>15 MB)", {
            action: { label: "Open externally", onClick: openExternally },
          });
          throw new Error("PDF too large (>15 MB).");
        }
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        let out = `# ${parsed.pathname.split("/").pop() || "PDF"}\n\n`;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          const txt = tc.items.map((it: any) => it.str).join(" ").replace(/\s+/g, " ").trim();
          if (txt) out += `\n\n## Page ${i}\n\n${txt}`;
          setSmartNotesImportProgress(35 + Math.round((i / doc.numPages) * 55));
        }
        appended = out;
      } else if (ct.startsWith("image/") || /\.(jpe?g|png|webp|gif|svg)$/.test(lower)) {
        appended = `![${parsed.pathname.split("/").pop() || "image"}](${parsed.toString()})`;
        setSmartNotesImportProgress(85);
      } else {
        appended = `[${parsed.toString()}](${parsed.toString()})`;
        setSmartNotesImportProgress(85);
      }
      setSmartNotesEditing(true);
      setSmartNotesDraft((prev) => (prev ? prev + "\n\n" : "") + appended);
      setSmartNotesImportProgress(100);
      toast.success("Link imported");
      requestAnimationFrame(() => {
        const ta = smartNotesEditorRef.current;
        if (ta) {
          ta.scrollIntoView({ behavior: "smooth", block: "center" });
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      });
    } catch (err: any) {
      logger.error("Smart Notes link import failed", err);
      toast.error(err?.message || "Link import failed");
      throw err;
    } finally {
      setTimeout(() => setSmartNotesImportProgress(null), 600);
    }
  }, []);

  // Shared importer: file input + drag-drop both call this. Same behavior as before —
  // appends parsed/extracted text (or markdown image) to the editor draft.
  const importFileToDraft = useCallback(async (f: File) => {
    if (!f) return;
    try {
      const name = f.name || "file";
      const lower = name.toLowerCase();
      const type = (f.type || "").toLowerCase();
      // 1) Plain text / markdown
      if (type.startsWith("text/") || /\.(md|markdown|txt)$/.test(lower)) {
        const text = await f.text();
        setSmartNotesDraft((prev) => (prev ? prev + "\n\n" : "") + text);
        toast.success("Text file imported");
        return;
      }
      // 2) PDF — extract text with pdfjs-dist (lazy import)
      if (type === "application/pdf" || lower.endsWith(".pdf")) {
        // OOM guard: cap local PDF imports at 15 MB to avoid WebView crashes.
        if (f.size > 15 * 1024 * 1024) {
          toast.error("PDF too large (>15 MB)", {
            description: "Open it in your device's PDF reader instead of importing.",
            action: {
              label: "Open file",
              onClick: () => {
                try {
                  const url = URL.createObjectURL(f);
                  openExternal(url).catch(() => { /* no-op */ });
                  setTimeout(() => URL.revokeObjectURL(url), 5000);
                } catch { /* no-op */ }
              },
            },
          });
          return;
        }
        toast.info("PDF se text extract ho raha hai…");
        const pdfjs: any = await import("pdfjs-dist");
        try {
          const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
          pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        } catch { /* worker set elsewhere */ }
        const buf = await f.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        let out = `# ${name.replace(/\.pdf$/i, "")}\n\n`;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          const txt = tc.items.map((it: any) => it.str).join(" ").replace(/\s+/g, " ").trim();
          if (txt) out += `\n\n## Page ${i}\n\n${txt}`;
        }
        setSmartNotesDraft((prev) => (prev ? prev + "\n\n" : "") + out);
        toast.success(`PDF imported (${doc.numPages} pages)`);
        return;
      }
      // 3) Image — embed as markdown image (base64 data URL)
      if (type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/.test(lower)) {
        const dataUrl: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result || ""));
          r.onerror = () => rej(r.error);
          r.readAsDataURL(f);
        });
        const md = `![${name}](${dataUrl})`;
        setSmartNotesDraft((prev) => (prev ? prev + "\n\n" : "") + md);
        toast.success("Image embedded");
        return;
      }
      // Fallback: try as text
      const text = await f.text();
      setSmartNotesDraft((prev) => (prev ? prev + "\n\n" : "") + text);
    } catch (err: any) {
      logger.error("Smart Notes import failed", err);
      toast.error(err?.message || "Upload failed");
    }
  }, []);

  // Auto-hide chrome (title row + chip strip) while reading a PDF for distraction-free view.
  const [chromeVisible, setChromeVisible] = useState<boolean>(true);
  const chromeHideTimer = useRef<number | null>(null);
  const scheduleHideChrome = useCallback(() => {
    if (chromeHideTimer.current) window.clearTimeout(chromeHideTimer.current);
    chromeHideTimer.current = window.setTimeout(() => setChromeVisible(false), 2500);
  }, []);
  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    scheduleHideChrome();
  }, [scheduleHideChrome]);

  // Rating state (local-only UI for now)
  const [ratingValue, setRatingValue] = useState<number>(0);
  const [ratingHover, setRatingHover] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState<string>("");
  const [ratingSubmitted, setRatingSubmitted] = useState<boolean>(false);
  const [ratingSaving, setRatingSaving] = useState<boolean>(false);
  const [ratingAvg, setRatingAvg] = useState<number>(0);
  const [ratingCount, setRatingCount] = useState<number>(0);

  // Ask-Doubt AI state — extracted to `useLessonChat` (Phase 2 split).
  // Hook is instantiated below after `course` state is defined; declared here
  // via a forward `let` binding would trip TDZ, so the hook call lives after
  // `submitRating` alongside the other lesson-scoped hooks.

  // Ask Doubt full-screen sheet
  const [doubtSheetOpen, setDoubtSheetOpen] = useState(false);
  const videoCurrentTimeRef = useRef<number>(0);
  // Audit Tier-2 #1: wire `useLessonProgress` — writes to `lesson_progress`
  // with debounced upsert, 90% unique-watch completion gate, and last-position
  // resume. The existing `user_progress` 80%-total-progress write in
  // `handleVideoTimeUpdate` stays as-is (different table, coarser signal).
  // Resume seek is dispatched via the already-wired `nb:lesson-seek`
  // window event that MahimaGhostPlayer listens for. A ref buffers the
  // pending position until the player reports ready, so we don't drop the
  // seek if the DB fetch resolves before the iframe mounts.
  const pendingResumeRef = useRef<number | null>(null);
  const playerReadyRef = useRef(false);
  const dispatchResumeSeek = useCallback((pos: number) => {
    try {
      window.dispatchEvent(new CustomEvent("nb:lesson-seek", { detail: pos }));
    } catch { /* noop */ }
  }, []);
  // Tracks whether this component is still mounted, and the last lesson the
  // user actually requested. Used by handleLessonClick to drop stale async
  // fetchSecureLessonUrl results that would otherwise corrupt the viewer.
  const isMountedRef = useRef(true);
  const currentLessonIdRef = useRef<string | null>(null);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  const getVideoTime = useCallback(() => videoCurrentTimeRef.current || 0, []);

  // Compat helper: existing callsites that say "switch to tab X" now expand that section.
  const setActiveTab = useCallback((id: string) => {
    // Map legacy accordion section ids to pill-chip ids.
    const chipMap: Record<string, string> = {
      overview: "timeline",
      pdf: "attachment",
      resources: "attachment",
      notes: "notes",
      doubts: "ask-doubt",
    };
    setActiveChip(chipMap[id] ?? id);
    setOpenSections((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  // Reset to only "overview" open when lesson changes
  useEffect(() => {
    setOpenSections(["overview"]);
  }, [currentLesson?.id]);

  // Chat reset + auto-scroll effects now live inside `useLessonChat`.

  // Strictly disable page scrolling whenever the device is in landscape.
  // This complements the existing fullscreen lock and covers landscape outside
  // the player's pseudo-fullscreen too.
  useEffect(() => {
    const mql = window.matchMedia("(orientation: landscape)");
    const apply = () => {
      const allow = document.body.classList.contains("nb-allow-landscape-scroll");
      const lock = mql.matches && !allow;
      document.body.style.overflow = lock ? "hidden" : "";
      document.documentElement.style.overflow = lock ? "hidden" : "";
      // Belt-and-suspenders for WebView (Capacitor APK) where body overflow alone
      // sometimes still allows rubber-band scrolling of the page behind the player.
      document.body.style.position = lock ? "fixed" : "";
      document.body.style.width = lock ? "100%" : "";
      document.body.style.touchAction = lock ? "none" : "";
    };
    apply();
    mql.addEventListener("change", apply);
    return () => {
      mql.removeEventListener("change", apply);
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.touchAction = "";
    };
  }, []);


  // Load this lesson's saved rating (mine + aggregate)
  useEffect(() => {
    if (!currentLesson?.id) return;
    let cancelled = false;
    (async () => {
      const { data: all } = await supabase
        .from("lesson_ratings")
        .select("rating, user_id, comment")
        .eq("lesson_id", currentLesson.id);
      if (cancelled || !all) return;
      const count = all.length;
      const avg = count > 0 ? all.reduce((s: number, r: any) => s + r.rating, 0) / count : 0;
      setRatingCount(count);
      setRatingAvg(avg);
      if (user) {
        const mine = all.find((r: any) => r.user_id === user.id);
        if (mine) {
          setRatingValue(mine.rating);
          setRatingComment(mine.comment || "");
          setRatingSubmitted(true);
        } else {
          setRatingValue(0); setRatingComment(""); setRatingSubmitted(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentLesson?.id, user]);

  const submitRating = useCallback(async () => {
    if (!user || !currentLesson?.id || ratingValue === 0) return;
    setRatingSaving(true);
    try {
      const { error } = await supabase
        .from("lesson_ratings")
        .upsert(
          { lesson_id: currentLesson.id, user_id: user.id, rating: ratingValue, comment: ratingComment.trim() || null },
          { onConflict: "lesson_id,user_id" }
        );
      if (error) throw error;
      setRatingSubmitted(true);
      toast.success(`Thanks! Aapne ${ratingValue} star diye.`);
      // refresh aggregate
      const { data: all } = await supabase
        .from("lesson_ratings").select("rating").eq("lesson_id", currentLesson.id);
      if (all) {
        setRatingCount(all.length);
        setRatingAvg(all.length ? all.reduce((s: number, r: any) => s + r.rating, 0) / all.length : 0);
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not save rating");
    } finally {
      setRatingSaving(false);
    }
  }, [user, currentLesson?.id, ratingValue, ratingComment]);

  // Ask-Doubt AI chat — extracted to `useLessonChat` (Phase 2 split).
  const {
    chatInput,
    setChatInput,
    chatBusy,
    chatMessages,
    askingName,
    chatScrollRef,
    sendChat,
    regenerateLast,
    copyChatText,
  } = useLessonChat(currentLesson, chapters, course?.title);

  const SARTHI_SUGGESTIONS = [
    "Is lecture ka short summary do",
    "Main concept explain karo",
    "1 short example do",
    "MCQ practice karao",
  ];

  const formatChatTs = (ts: number) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  // Comments hook
  // Comments hook
  const { comments, loading: commentsLoading, createComment, fetchComments } = useComments(currentLesson?.id || undefined);
  
  // Likes hook
  const { likeCount, hasLiked, toggleLike, loading: likesLoading } = useLessonLikes(currentLesson?.id || undefined);

  // Lesson PDFs hook
  const { pdfs: lessonPdfs, loading: pdfsLoading } = useLessonPdfs(currentLesson?.id || undefined);

  // Lesson attachments (new, richer than lesson_pdfs — supports any file kind)
  const { attachments: lessonAttachments, loading: attachmentsLoading, getSignedUrl: getAttachmentUrl } = useLessonAttachments(currentLesson?.id || undefined);

   // PDF viewer state
  const [showPdfPopup, setShowPdfPopup] = useState(false);
  // Separate picker used only for "PDF Download" flow. Sharing state with
  // showPdfPopup would conflate open-vs-download intents on select.
  const [showPdfDownloadPopup, setShowPdfDownloadPopup] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<PdfItem | null>(null);
  // Immersive full-page reader for deep-link PDF opens (e.g. Notes sheet →
  // ?openPdf=<id>). Distinct from `selectedPdf` (inline reader below the
  // player) so that in-lesson attachment chips remain inline.
  const [immersivePdf, setImmersivePdf] = useState<{ id?: string; url: string; title: string; badge?: string } | null>(null);
  const [notesOpen, setNotesOpen] = useState<boolean>(true);
  const [isPiPMode, setIsPiPMode] = useState(false);
  const [pdfToolbarOpen, setPdfToolbarOpen] = useState(false);
  // Downloads hook
  const { addDownload } = useDownloads();

  const redactPdfDebugUrl = useCallback((raw: string): string => {
    try {
      const u = new URL(raw, window.location.origin);
      return `${u.origin}${u.pathname}${u.search ? "?…" : ""}`;
    } catch {
      return raw.split("?")[0];
    }
  }, []);

  const shouldUsePdfReader = useCallback(async (url: string, fileName: string): Promise<boolean> => {
    if (isLikelyPdfUrl(url)) return true;
    // Google Drive file shares render in-app via pdf-proxy + pdf.js (see
    // resolveEmbedUrl). Always route them through the reader.
    if (/drive\.google\.com\/(file\/d\/|open\?[^#]*id=|uc\?[^#]*id=)/i.test(url)) return true;
    // Notion + Google Docs are handled by in-app renderers upstream.
    if (isNotion(url) || /docs\.google\.com\/document/i.test(url)) return true;
    if (isKnownNonPdfWebUrl(url)) return false;
    // Default: trust the reader. pdf.js gracefully errors out for true HTML
    // and we'd rather show that than bounce the user to the browser with a
    // confusing toast for every signed/extensionless PDF URL.
    return true;
  }, []);

  /** Open a PDF from Notes / DPP / Attachment inside the lesson page.
   *
   * Product rule (see src/lib/openPdfHybrid.ts): PDFs must ALWAYS render in
   * the in-app reader. We used to call openNativeDocument() for `lessonPdfs`,
   * which on Capacitor handed the file off to the OS document surface and
   * pushed users out of the lesson view. Removed — every PDF now mounts
   * inline via <PdfViewer> → <FastPdfReader> on web and APK.
   */
  const openPdfItem = useCallback(async (
    pdf: PdfItem,
    options?: { immersive?: boolean },
  ): Promise<"reader" | "browser" | "error"> => {
    void selectionHaptic();
    let url = pdf.file_url || "";
    // `storage://bucket/path` cannot be loaded by the WebView directly.
    // Resolve it to a signed https URL via the secure edge function before
    // handing it to <PdfViewer>, otherwise the reader shows a blank screen
    // inside the Capacitor APK (and a fetch error on web).
    if (/^storage:\/\//i.test(url) && currentLesson?.id) {
      const t = toast.loading("Opening PDF…");
      try {
        const resolved = await fetchSecureLessonUrl(currentLesson.id);
        const next =
          (pdf.id === "class-pdf" ? resolved?.class_pdf_url : null) ||
          (pdf.id === "lesson-file" ? (resolved?.video_url || resolved?.class_pdf_url) : null) ||
          resolved?.class_pdf_url ||
          resolved?.video_url ||
          "";
        if (next && !/^storage:\/\//i.test(next)) {
          url = next;
          // Refresh currentLesson so subsequent opens skip the round-trip.
          setCurrentLesson((prev) => prev ? {
            ...prev,
            video_url: resolved?.video_url || prev.video_url,
            class_pdf_url: resolved?.class_pdf_url || prev.class_pdf_url,
          } : prev);
        }
        toast.dismiss(t);
      } catch {
        toast.error("Couldn't open PDF", { id: t });
        return "error";
      }
    }
    if (!url || /^storage:\/\//i.test(url)) {
      toast.error("PDF link is not ready yet. Please try again.");
      return "error";
    }
    if (isNotion(url)) {
      if (options?.immersive) {
        setImmersivePdf({ id: pdf.id, url, title: pdf.file_name, badge: "PDF" });
      } else {
        setActiveChip("attachment");
        setSelectedPdf({ ...pdf, file_url: url });
      }
      return "reader";
    }

    // Guard: not every "attachment" is actually a PDF. Google Docs/Drive share
    // links, plain web articles, etc. used to be handed straight to pdf.js,
    // which exploded with InvalidPDF / WorkerFailed errors and a blank screen
    // on the APK. Notion is excluded above because it has its own in-app native
    // renderer via <NotionPageRenderer>.
    if (!(await shouldUsePdfReader(url, pdf.file_name))) {
      setSelectedPdf(null);
      setImmersivePdf(null);
      // Silently hand off to the browser — no toast. Users tapping a link
      // already know they're opening it; the old "non-PDF" toast was noisy
      // and triggered for legitimate Drive PDFs.
      try {
        await openExternal(url, { preferWebView: false });
      } catch (err) {
        console.warn("[openPdfItem] openExternal failed", err);
        toast.error("Couldn't open this attachment");
        return "error";
      }
      return "browser";
    }
    // G1 fix: run the non-PDF safety net ONE more time on the resolved URL
    // BEFORE we mount the reader, so a mis-classified Drive/Docs link cannot
    // flash the reader for a frame and immediately unmount from the
    // post-mount effect below.
    if (isKnownNonPdfWebUrl(url) && !isNotion(url) && !isGoogleDocs(url)) {
      try { await openExternal(url, { preferWebView: false }); }
      catch (err) {
        console.warn("[openPdfItem] non-PDF openExternal failed", err);
        toast.error("Couldn't open this attachment");
        return "error";
      }
      return "browser";
    }
    // Immersive path (deep-link from Notes sheet): full-page DocumentReader.
    // Inline path (in-lesson attachment chip): inline PdfViewer below player.
    if (options?.immersive) {
      setImmersivePdf({ id: pdf.id, url, title: pdf.file_name, badge: "PDF" });
      return "reader";
    }
    setActiveChip("attachment");
    setSelectedPdf({ ...pdf, file_url: url });
    return "reader";
  }, [currentLesson?.id, redactPdfDebugUrl, shouldUsePdfReader]);

  const pdfHistorySentinelActiveRef = useRef(false);
  const closeSelectedPdf = useCallback(() => {
    if (pdfHistorySentinelActiveRef.current && window.history.state?.pdfFullscreen) {
      try {
        // G2 fix: drop the 350ms setTimeout — it leaked the sentinel ref when
        // the component unmounted mid-close. popstate handler flips
        // pdfHistorySentinelActiveRef synchronously and clears selectedPdf, so
        // an eager local clear is safe (and idempotent).
        pdfHistorySentinelActiveRef.current = false;
        window.history.back();
        setSelectedPdf(null);
        setPdfToolbarOpen(false);
        return;
      } catch {
        pdfHistorySentinelActiveRef.current = false;
      }
    }
    setSelectedPdf(null);
    setPdfToolbarOpen(false);
  }, []);

  /**
   * Save a lesson PDF to the device via the shared download pipeline. Google
   * Drive URLs are streamed through pdf-proxy so the file lands as raw PDF
   * bytes — never a redirect to Drive's HTML wrapper / account-picker.
   */
  const downloadPdfItem = useCallback(async (pdf: PdfItem) => {
    let url = pdf.file_url;
    let filename = pdf.file_name || "document.pdf";
    if (isGoogleDrive(url)) {
      const proxied = googleDrivePdfProxyUrl(url);
      if (proxied) url = proxied;
      if (!/\.[a-z0-9]{2,5}$/i.test(filename)) filename = `${filename}.pdf`;
    }
    await addDownload(pdf.file_name || filename, url, filename, "PDF");
  }, [addDownload]);

  const saveSelectedPdf = useCallback(async () => {
    if (!selectedPdf) return;
    // Route through downloadPdfItem so Google Drive URLs get proxied to
    // raw PDF bytes (never Drive's HTML wrapper / account-picker) and the
    // filename always lands with a `.pdf` extension.
    await downloadPdfItem(selectedPdf);
  }, [downloadPdfItem, selectedPdf]);

  const exportSelectedPdf = useCallback(async () => {
    if (!selectedPdf) return;
    const share = typeof navigator !== "undefined" ? navigator.share : undefined;
    if (share) {
      try {
        await share({ title: selectedPdf.file_name, url: selectedPdf.file_url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    await saveSelectedPdf();
  }, [saveSelectedPdf, selectedPdf]);

  const pdfToolbarActions = selectedPdf ? [
    { label: "Export", icon: Share2, action: exportSelectedPdf },
    { label: "Download", icon: Download, action: saveSelectedPdf },
    { label: "Open In Web", icon: ExternalLink, action: () => openExternal(selectedPdf.file_url, { preferWebView: false }) },
    { label: "Close", icon: X, action: closeSelectedPdf },
  ] : [];

  // Derived: when an inline reader (PDF attachment OR Smart Notes) is open,
  // the lesson page collapses title/chips and treats the panel area as an
  // edge-to-edge reader (auto-hide chrome, landscape scroll, back-to-close).
  const hasNotes = !!currentLesson?.transcript_md;
  const isReader =
    (activeChip === "attachment" && !!selectedPdf) ||
    (activeChip === "notes" && hasNotes);
  // Notes panel always renders edge-to-edge (no card/box) — even the empty
  // state should sit full-width below the player, never inside a rounded card.
  const isNotesPanel = activeChip === "notes";

  // Landscape-scroll rule: allow vertical scrolling in fake-fullscreen ONLY while
  // the user has an inline PDF *open* (so they can scroll the PDF below the
  // player). Tying to `selectedPdf` instead of just "has PDFs" prevents the lock
  // from leaking after the user closes the PDF without rotating.
  useEffect(() => {
    const allow = isReader;
    document.body.classList.toggle("nb-allow-landscape-scroll", allow);
    return () => document.body.classList.remove("nb-allow-landscape-scroll");
  }, [isReader]);

  // In-app PDF debug — show resolved attachment id + URL whenever a PDF opens.
  // Enable: `?debug=1` in URL, or `localStorage.setItem('nb_pdf_debug','1')`
  // (persists across reloads — perfect for on-device APK QA).
  // Disable: `localStorage.removeItem('nb_pdf_debug')`.
  //
  // Hardening (v2, 5/5):
  // 1. Console + toast both GATED on debug flag — zero noise in production.
  // 2. URL is redacted (origin + path only) before display/clipboard so
  //    short-lived signed tokens never leak into logcat, screenshots, or
  //    a user's clipboard. Full URL stays in-memory for the viewer only.
  // 3. Source detection mirrors resolveDeepLinkPdf's priority — paired
  //    with the resolver's own [pdf-debug] trace, you can see WHY an id
  //    was picked, not just WHAT.
  useEffect(() => {
    if (!selectedPdf) return;
    // Always-on lightweight open log (URL is redacted below). The toast/clipboard
    // affordance stays behind nb_pdf_debug — but the console line is unconditional
    // so blank-PDF reports can be triaged from session logs without on-device opt-in.
    const debugOn =
      new URLSearchParams(window.location.search).has("debug") ||
      safeGet("nb_pdf_debug") === "1";


    const safeUrl = redactPdfDebugUrl(selectedPdf.file_url);
    // Safety net: if any code path (deep-link resolver, attachment row, etc.)
    // pushed a known HTML page into the viewer, only bounce generic web pages.
    // Notion pages are allowed here because PdfViewer renders them natively
    // through NotionPageRenderer; sending them to pdf.js was the old blank bug.
    if (isKnownNonPdfWebUrl(selectedPdf.file_url) && !isNotion(selectedPdf.file_url) && !isGoogleDocs(selectedPdf.file_url)) {
      // eslint-disable-next-line no-console
      console.warn("[pdf-debug] non-PDF URL routed to browser", { id: selectedPdf.id, host: safeUrl });
      const url = selectedPdf.file_url;
      setSelectedPdf(null);
      // Silent hand-off — toast removed (false-positives on Drive PDFs).
      void openExternal(url, { preferWebView: false }).catch((err) => {
        console.warn("[pdf-debug] openExternal failed", err);
        toast.error("Couldn't open this attachment");
      });
      return;
    }
    const info = {
      id: selectedPdf.id,
      file_name: selectedPdf.file_name,
      file_url_redacted: safeUrl,
      source:
        selectedPdf.id === "class-pdf"
          ? "class_pdf_url"
          : selectedPdf.id === "lesson-file"
            ? "lesson_video_url"
          : lessonPdfs.some((p) => p.id === selectedPdf.id)
            ? "lesson_pdfs"
            : "lesson_attachments",
    };
    if (!debugOn) return;
    // eslint-disable-next-line no-console
    console.log("[pdf-debug] opened", info);
    const short = safeUrl.length > 60 ? safeUrl.slice(0, 57) + "…" : safeUrl;
    toast.info(`PDF: ${info.id} (${info.source})`, {
      description: short,
      duration: 8000,
      action: {
        label: "Copy URL",
        onClick: () => {
          try {
            navigator.clipboard?.writeText(safeUrl);
            toast.success("Redacted URL copied (token stripped)");
          } catch {
            toast.error("Copy failed");
          }
        },
      },
    });

  }, [selectedPdf, lessonPdfs, redactPdfDebugUrl]);

  // When a PDF opens, show chrome briefly then auto-hide for distraction-free reading.
  useEffect(() => {
    if (isReader) {
      setChromeVisible(true);
      scheduleHideChrome();
    } else {
      setChromeVisible(true);
      if (chromeHideTimer.current) window.clearTimeout(chromeHideTimer.current);
    }
    return () => {
      if (chromeHideTimer.current) window.clearTimeout(chromeHideTimer.current);
    };
  }, [isReader, scheduleHideChrome]);

  // Android / browser back-button integration for the inline PDF viewer only.
  // Cleanup must NEVER call history.back(); doing so created a back-loop where
  // closing a PDF popped the lesson route too. User taps close → closeSelectedPdf
  // pops the sentinel. Hardware back → popstate closes selectedPdf.
  useEffect(() => {
    if (!selectedPdf) return;
    try {
      window.history.pushState({ pdfFullscreen: true }, "");
      pdfHistorySentinelActiveRef.current = true;
    } catch {}
    const onPop = () => {
      pdfHistorySentinelActiveRef.current = false;
      setSelectedPdf(null);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.pdfFullscreen) {
        try {
          window.history.replaceState({ ...window.history.state, pdfFullscreen: false, overlay: false }, "");
        } catch {}
      }
      pdfHistorySentinelActiveRef.current = false;
    };
  }, [selectedPdf?.id]);

  // Progress tracking state
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const progressSavedRef = useRef<string | null>(null);

  // DPP (Daily Practice Problems) for this lesson/chapter
  const [lessonDpps, setLessonDpps] = useState<{ id: string; title: string; total_marks: number | null; type: string | null }[]>([]);
  const [dppsLoading, setDppsLoading] = useState(false);

  // Load completed lessons from DB on mount
  useEffect(() => {
    if (!user || !courseId) return;
    let cancelled = false;
    supabase.from('user_progress')
      .select('lesson_id')
      .eq('user_id', user.id)
      .eq('course_id', Number(courseId))
      .eq('completed', true)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCompletedLessonIds(new Set(data.map(r => r.lesson_id)));
      });
    return () => { cancelled = true; };
  }, [user, courseId]);

  // Fetch DPPs for current lesson or chapter
  useEffect(() => {
    if (!currentLesson) { setLessonDpps([]); return; }
    let cancelled = false;
    const fetchDpps = async () => {
      if (!cancelled) setDppsLoading(true);
      let query = supabase
        .from("quizzes")
        .select("id, title, total_marks, type")
        .eq("is_published", true);

      // Try lesson_id first, then chapter_id, then course_id
      if (currentLesson.id) {
        const { data: byLesson } = await query.eq("lesson_id", currentLesson.id);
        if (cancelled) return;
        if (byLesson && byLesson.length > 0) {
          setLessonDpps(byLesson);
          setDppsLoading(false);
          return;
        }
      }
      if (currentLesson.chapter_id) {
        const { data: byChapter } = await supabase
          .from("quizzes")
          .select("id, title, total_marks, type")
          .eq("is_published", true)
          .eq("chapter_id", currentLesson.chapter_id);
        if (cancelled) return;
        if (byChapter && byChapter.length > 0) {
          setLessonDpps(byChapter);
          setDppsLoading(false);
          return;
        }
      }
      if (!cancelled) {
        setLessonDpps([]);
        setDppsLoading(false);
      }
    };
    fetchDpps();
    return () => { cancelled = true; };
  }, [currentLesson?.id, currentLesson?.chapter_id, currentLesson?.course_id]);

  // Reset saved ref and close PDF viewer when lesson changes
  useEffect(() => {
    progressSavedRef.current = null;
    if (pdfHistorySentinelActiveRef.current && window.history.state?.pdfFullscreen) {
      try { window.history.replaceState({ ...window.history.state, pdfFullscreen: false, overlay: false }, ""); } catch {}
      pdfHistorySentinelActiveRef.current = false;
    }
    setSelectedPdf(null);
    setImmersivePdf(null);
    setShowPdfPopup(false);
  }, [currentLesson?.id]);

  // Auto-open a PDF when arriving via the PDFs deep-link.
  // - `?openPdf=1`     → first available PDF
  // - `?openPdf=<id>`  → specific PDF / attachment by id (falls back to first)
  // Without this the user lands on the Notes/Attachments list and has to tap
  // again — the lecture-card and attachment-tap flows open the PDF directly.
  const autoOpenedPdfRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentLesson?.id) return;
    const openPdfParam = searchParams.get("openPdf");
    if (!openPdfParam) return;
    if (pdfsLoading || attachmentsLoading) return;
    if (selectedPdf || immersivePdf) return;
    if (autoOpenedPdfRef.current === currentLesson.id) return;

    // For standalone PDF/NOTES/DPP lessons, the cinema area at line ~1872
    // already mounts a <PdfViewer> for currentLesson.video_url. Auto-opening
    // the same URL into the attachment-chip reader mounts a SECOND PdfViewer
    // for the same Notion/Drive source. react-notion-x's singleton context
    // and the duplicate iframes race each other, leaving the visible cinema
    // viewer blank. Skip auto-open for these lecture types — the user already
    // sees the PDF rendered up top.
    const lt = (currentLesson.lecture_type || "").toUpperCase();
    if (lt === "PDF" || lt === "NOTES" || lt === "DPP" || lt === "DPP_ATTEMPT") {
      autoOpenedPdfRef.current = currentLesson.id;
      return;
    }

    const resolved = resolveDeepLinkPdf(
      openPdfParam,
      {
        id: currentLesson.id,
        title: currentLesson.title,
        video_url: currentLesson.video_url,
        class_pdf_url: currentLesson.class_pdf_url,
        lecture_type: currentLesson.lecture_type,
      },
      lessonPdfs,
      lessonAttachments,
    );
    if (!resolved) {
      // eslint-disable-next-line no-console
      console.warn("[eval-debug] pdf resolve failed", {
        openPdfParam,
        lessonId: currentLesson.id,
        pdfCount: lessonPdfs.length,
        attachmentCount: lessonAttachments.length,
      });
      toast.error("Couldn't find that PDF", {
        description: openPdfParam === "1"
          ? "No PDF, DPP, or notes file is linked to this lesson."
          : `No matching attachment for id "${openPdfParam}".`,
      });
      autoOpenedPdfRef.current = currentLesson.id;
      return;
    }

    if (resolved.kind === "direct") {
      // If the file_url is still a `storage://` URI (signed URL hasn't been
      // populated yet for this lesson), trigger fetchSecureLessonUrl now and
      // patch currentLesson — the effect re-runs once class_pdf_url updates
      // to an https URL and the PDF then opens. Without this kick, the
      // auto-open silently no-op'd and the user saw nothing happen after
      // tapping "Open" on a PDF card.
      if (/^storage:\/\//i.test(resolved.pdf.file_url || "")) {
        autoOpenedPdfRef.current = currentLesson.id; // guard against re-fire
        (async () => {
          const urls = await fetchSecureLessonUrl(currentLesson.id);
          const nextPdf =
            (resolved.pdf.id === "class-pdf" ? urls?.class_pdf_url : null) ||
            (resolved.pdf.id === "lesson-file" ? (urls?.video_url || urls?.class_pdf_url) : null) ||
            urls?.class_pdf_url ||
            urls?.video_url ||
            null;
          if (nextPdf && !/^storage:\/\//i.test(nextPdf)) {
            setCurrentLesson((prev) => prev ? {
              ...prev,
              video_url: urls?.video_url || prev.video_url,
              class_pdf_url: urls?.class_pdf_url || prev.class_pdf_url,
            } : prev);
            void openPdfItem({ ...resolved.pdf, file_url: nextPdf }, { immersive: true });
          } else {
            autoOpenedPdfRef.current = null; // allow retry
            toast.error("Couldn't open PDF", { description: "Signed URL unavailable. Try again." });
          }
        })();
        return;
      }
      void openPdfItem(resolved.pdf, { immersive: true });
      autoOpenedPdfRef.current = currentLesson.id;
      return;
    }

    // Attachment — needs a signed URL
    const att = lessonAttachments.find((a) => a.id === resolved.attachment.id);
    if (!att) {
      // eslint-disable-next-line no-console
      console.warn("[eval-debug] pdf attachment missing from list", {
        wantedId: resolved.attachment.id,
        lessonId: currentLesson.id,
      });
      toast.error("Attachment unavailable", {
        description: "It may have been removed. Pull to refresh and try again.",
      });
      autoOpenedPdfRef.current = currentLesson.id;
      return;
    }
    (async () => {
      try {
        const url = await getAttachmentUrl(att);
        if (!url) {
          // eslint-disable-next-line no-console
          console.warn("[eval-debug] pdf signed url empty", {
            attachmentId: att.id,
            file_name: resolved.attachment.file_name,
          });
          toast.error("Couldn't open PDF", {
            description: "The download link returned empty. Check your connection and retry.",
          });
          return;
        }
        void openPdfItem({
          id: att.id,
          file_name: resolved.attachment.file_name,
          file_url: url,
        }, { immersive: true });
        autoOpenedPdfRef.current = currentLesson.id;
      } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("[eval-debug] pdf open failed", {
          attachmentId: att.id,
          file_name: resolved.attachment.file_name,
          error: (err as Error)?.message || String(err),
        });
        toast.error("Couldn't open PDF", {
          description: (err as Error)?.message || "Unknown error while resolving attachment.",
        });
      }
    })();
  }, [
    currentLesson?.id,
    currentLesson?.class_pdf_url,
    currentLesson?.title,
    pdfsLoading,
    attachmentsLoading,
    lessonPdfs,
    lessonAttachments,
    searchParams,
    selectedPdf,
    immersivePdf,
    getAttachmentUrl,
    openPdfItem,
  ]);

  // Flush progress on tab-hide / back-press / route teardown so users don't
  // lose mid-video watch position. Idempotent (on-conflict upsert).
  useEffect(() => {
    const flush = () => {
      if (!user || !currentLesson || !courseId) return;
      const t = videoCurrentTimeRef.current ?? 0;
      if (t <= 0) return;
      if (progressSavedRef.current === currentLesson.id) return; // already 80%-saved
      // Audit F1: `void` + empty catch swallowed rejections silently. Await
      // + logger.error so failed background flushes surface in Sentry.
      (async () => {
        try {
          const { error: upErr } = await supabase.from('user_progress').upsert({
            user_id: user.id,
            lesson_id: currentLesson.id,
            course_id: Number(courseId),
            completed: false,
            watched_seconds: Math.floor(t),
            last_watched_at: new Date().toISOString(),
          }, { onConflict: 'user_id,lesson_id' });
          if (upErr) logger.warn('[user_progress] background flush failed', { err: upErr });
        } catch (err) {
          logger.warn('[user_progress] background flush threw', { err });
        }
      })();
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [user, currentLesson?.id, courseId]);

  // Handle video time update → save progress at 80%
  const handleVideoTimeUpdate = useCallback(async (currentTime: number, duration: number) => {
    videoCurrentTimeRef.current = currentTime;
    // Feed the lesson_progress hook (debounced upsert, 90% completion gate).
    reportLessonProgress(currentTime);
    // Snapshot the lesson id BEFORE any await (audit H-3): rapid lesson
    // switching used to let `currentLesson` change while the upsert was
    // in-flight, writing the current progress against the wrong lesson id.
    const lessonId = currentLesson?.id;
    if (!user || !lessonId || !courseId || duration <= 0) return;
    const progress = currentTime / duration;
    if (progress >= 0.8 && progressSavedRef.current !== lessonId) {
      progressSavedRef.current = lessonId;
      try {
        await supabase.from('user_progress').upsert({
          user_id: user.id,
          lesson_id: lessonId,
          course_id: Number(courseId),
          completed: true,
          watched_seconds: Math.floor(currentTime),
          last_watched_at: new Date().toISOString(),
        }, { onConflict: 'user_id,lesson_id' });
        setCompletedLessonIds(prev => new Set([...prev, lessonId]));
        void notifySuccess();
      } catch (err) {
        logger.error('Progress save error:', err);
      }
    }
  }, [user, currentLesson?.id, courseId]);

  // Wire lesson_progress: interval-based unique-watch tracking + resume.
  const { report: reportLessonProgress, flush: flushLessonProgress } =
    useLessonProgress(currentLesson?.id, videoDuration, (lastPosition) => {
      // Buffer the seek until the player reports ready; MahimaGhostPlayer
      // ignores seekTo before playerReady is true.
      if (playerReadyRef.current) dispatchResumeSeek(lastPosition);
      else pendingResumeRef.current = lastPosition;
    });

  // Reset ready flag whenever the lesson changes.
  useEffect(() => {
    playerReadyRef.current = false;
    pendingResumeRef.current = null;
    return () => { void flushLessonProgress(); };
  }, [currentLesson?.id, flushLessonProgress]);


  
  // Check if user is admin or teacher
  const { isAdmin, isTeacher } = useAuth();
  const isAdminOrTeacher = isAdmin || isTeacher;

  // Load notes from storage when lesson changes
  useEffect(() => {
    if (currentLesson?.id) {
      const savedNote = safeGet(`lesson_note_${currentLesson.id}`);
      if (savedNote) {
        setNoteContent(savedNote);
      } else {
        setNoteContent("");
      }
    }
  }, [currentLesson?.id]);

  // Auto-save notes to storage
  useEffect(() => {
    if (currentLesson?.id && noteContent) {
      const timer = setTimeout(() => {
        safeSet(`lesson_note_${currentLesson.id}`, noteContent);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [noteContent, currentLesson?.id]);

  // Load archive books from storage when lesson changes
  useEffect(() => {
    if (currentLesson?.id) {
      const savedBooks = safeGet(`lesson_archive_books_${currentLesson.id}`);
      if (savedBooks) {
        try {
          setArchiveBooks(JSON.parse(savedBooks));
        } catch {
          setArchiveBooks([]);
        }
      } else {
        setArchiveBooks([]);
      }
    }
  }, [currentLesson?.id]);

  // Archive books management functions
  const handleAddArchiveBook = (book: Omit<ArchiveBook, 'id'>) => {
    if (!currentLesson?.id) return;
    
    const newBook: ArchiveBook = {
      ...book,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    
    const updatedBooks = [...archiveBooks, newBook];
    setArchiveBooks(updatedBooks);
    safeSet(`lesson_archive_books_${currentLesson.id}`, JSON.stringify(updatedBooks));
    toast.success("Book added to lesson resources!");
  };

  const handleRemoveArchiveBook = (bookId: string) => {
    if (!currentLesson?.id) return;
    
    const updatedBooks = archiveBooks.filter(b => b.id !== bookId);
    setArchiveBooks(updatedBooks);
    safeSet(`lesson_archive_books_${currentLesson.id}`, JSON.stringify(updatedBooks));
    toast.success("Book removed from lesson resources");
  };

  // Fetch secure video/pdf URL for current lesson via Supabase Edge Function.
  // Uses supabase.functions.invoke so it works in every environment (Lovable
  // preview, Vercel static, Replit/Express, Capacitor native) — the previous
  // `/api/functions/v1/...` fetch only worked behind the Replit Express proxy
  // and silently returned index.html on Lovable/Vercel, leaving video_url
  // empty and the player stuck on "Select a lesson to watch".
  const fetchSecureLessonUrl = async (lessonId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("get-lesson-url", {
        body: { lesson_id: lessonId },
      });
      if (error) {
        const fnErr = error as { context?: { status?: number; json?: () => Promise<{ error?: string } | null> }; status?: number };
        const status = fnErr.context?.status ?? fnErr.status;
        let errData: { error?: string } | null = null;
        try {
          errData = (await fnErr.context?.json?.()) ?? null;
        } catch {}
        if (status === 403) {
          toast.error(errData?.error || "Purchase required to access this lesson");
        } else if (status && status >= 500) {
          toast.error("Server error loading lesson. Please retry.");
        } else {
          toast.error(errData?.error || error.message || "Network error loading lesson URL");
        }
        return null;
      }
      return data as { video_url: string | null; class_pdf_url: string | null } | null;
    } catch {
      toast.error("Network error loading lesson URL");
      return null;
    }
  };


  // --- 1. DATA FETCHING (offline-first) ---
  // Strategy: hydrate from cache synchronously so the page paints immediately
  // even on 2G/offline, then refresh from the network in the background. On
  // offline / network failure we keep showing the cached bundle and only show
  // an error toast if the cache was empty too.
  useEffect(() => {
    if (!courseId) return;

    let cancelled = false;
    const controller = new AbortController();
    const signal = controller.signal;
    const aliveRef = isMountedRef; // alias for read-clarity below


    mark("lesson:open");
    // Step 1: synchronous cache hydration (zero network).
    const cached = readBundleSync(courseId);
    if (cached) {
      setCourse(cached.course);
      setChapters(cached.chapters as unknown as Chapter[]);
      setLessons(cached.lessons as unknown as Lesson[]);
      setHasPurchased(cached.hasPurchased);
      setLoading(false); // unblock the UI immediately
      measure("lesson:cached-ready", "lesson:open");
      // Optimistically show the first/last-viewed lesson from cache so the
      // player isn't stuck on the empty placeholder while the network
      // refresh + secure-URL fetch are in flight.
      const cachedLessons = (cached.lessons as unknown as Lesson[]) || [];
      if (cachedLessons.length > 0) {
        const pick = cachedLessons.find(l => l.id === lessonIdParam) || cachedLessons[0];
        setCurrentLesson(pick);
      }
    }

    const initPage = async () => {
      try {
        if (!cached) setLoading(true);

        // If we're offline AND have cache, skip the network entirely — the
        // background refresh would just fail noisily.
        if (isOffline() && cached) {
          // Still try to recall the last-viewed lesson from this course.
          const lastId = await recallLastLesson(courseId);
          const target = lastId
            ? (cached.lessons as unknown as Lesson[]).find(l => l.id === lastId) ?? (cached.lessons as unknown as Lesson[])[0]
            : (cached.lessons as unknown as Lesson[])[0];
          if (target && !cancelled) {
            // Video URL needs network — leave empty so player shows offline state.
            setCurrentLesson({ ...target, video_url: "", class_pdf_url: null } as Lesson);
          }
          return;
        }

        // Use getSession (reads from local storage, no network) instead of
        // getUser (auth server round-trip). Cold-start latency was 600-1500ms
        // on slow networks and gated the entire parallel fetch below — which
        // is why lessons appeared to "load very late" after the player frame.
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;

        // Single RPC call replaces enrollment + course + chapters + lessons round-trips.
        const { data: bundle, error: bundleErr } = await supabase
          .rpc('get_course_bundle', { _course_id: Number(courseId) })
          .abortSignal(signal);

        if (cancelled || signal.aborted || !aliveRef.current) return;
        if (bundleErr) throw bundleErr;

        const b = (bundle ?? {}) as {
          course: any;
          chapters: any[];
          lessons: any[];
          is_enrolled: boolean;
        };

        const enrolled = !!b.is_enrolled;
        if (enrolled) setHasPurchased(true);
        if (!b.course) throw new Error('Course not found');

        setCourse(b.course);
        setChapters(b.chapters || []);

        const mappedLessons: Lesson[] = (b.lessons || []).map((l: any) => ({
          ...l,
          video_url: l.video_url || '',
          class_pdf_url: l.class_pdf_url || null,
          overview: l.overview || null,
          lecture_type: l.lecture_type || null,
        }));

        setLessons(mappedLessons);

        // Write-through cache so the next visit hydrates instantly.
        writeBundle(courseId, {
          course: b.course,
          chapters: (b.chapters || []) as unknown as import("../lib/perf/lessonViewCache").CachedChapter[],
          lessons: mappedLessons as unknown as import("../lib/perf/lessonViewCache").CachedLesson[],
          hasPurchased: enrolled,
        });




        if (mappedLessons.length > 0) {
          let targetLessonId = lessonIdParam;
          if (!targetLessonId && tokenParam) {
            try {
              const decoded = JSON.parse(atob(tokenParam));
              targetLessonId = decoded.l || null;
            } catch { /* ignore */ }
          }
          // Fall back to last-viewed lesson for this course if no param.
          if (!targetLessonId) {
            targetLessonId = await recallLastLesson(courseId);
          }
          const targetLesson = targetLessonId
            ? mappedLessons.find(l => l.id === targetLessonId) || mappedLessons[0]
            : mappedLessons[0];
          // Render immediately with the raw URL so the player never gets
          // stuck on "Select a lesson to watch" while the edge function is
          // in-flight or failing.
          setCurrentLesson(targetLesson);
          const urls = await fetchSecureLessonUrl(targetLesson.id);
          if (cancelled) return;
          if (urls && (urls.video_url || urls.class_pdf_url)) {
            setCurrentLesson({
              ...targetLesson,
              video_url: urls.video_url || targetLesson.video_url || '',
              class_pdf_url: urls.class_pdf_url || targetLesson.class_pdf_url || null,
            });
          }
          rememberLastLesson(courseId, targetLesson.id);
        }

      } catch (error) {
        logger.error("Error loading lessons:", error);
        // Only surface the error if we have nothing cached to fall back on.
        if (!cached) {
          // Try async cache as a last resort (covers cold native start where
          // localStorage may be empty but Preferences has data).
          const lateCache = await readBundle(courseId);
          if (lateCache && !cancelled) {
            setCourse(lateCache.course);
            setChapters(lateCache.chapters as unknown as Chapter[]);
            setLessons(lateCache.lessons as unknown as Lesson[]);
            setHasPurchased(lateCache.hasPurchased);
          } else if (!cancelled) {
            toast.error(isOffline() ? "You're offline. Reconnect to load this course." : "Could not load course content");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          measure("lesson:ready", "lesson:open");
        }
      }
    };

    initPage();
    return () => { cancelled = true; controller.abort(); };
  }, [courseId]);

  // Enrollment guard: redirect unenrolled non-admin users
  useEffect(() => {
    if (!loading && !hasPurchased && !isAdminOrTeacher && courseId && user) {
      toast.error("Please purchase this course to access lessons.");
      navigate(`/buy-course?id=${courseId}`, { replace: true });
    }
  }, [loading, hasPurchased, isAdminOrTeacher, courseId, user, navigate]);

  // Refetch comments when lesson changes
  useEffect(() => {
    if (currentLesson?.id) {
      fetchComments();
    }
  }, [currentLesson?.id, fetchComments]);

  // --- Logic ---
  const canAccessLesson = (lesson: Lesson) => {
    return !lesson.is_locked || hasPurchased;
  };

  const handleLessonClick = async (lesson: Lesson) => {
    if (!canAccessLesson(lesson)) {
      toast.error("Course locked! Please buy to watch.");
      navigate(`/buy-course?id=${courseId}`);
      return;
    }
    // Switch instantly, then hydrate secure URLs. The previous guard compared
    // against the currently-open lesson before updating the requested id, so
    // every second lesson tap was dropped and LessonView felt frozen/slow.
    const requestedId = lesson.id;
    currentLessonIdRef.current = requestedId;
    setCurrentLesson({
      ...lesson,
      video_url: lesson.video_url || '',
      class_pdf_url: lesson.class_pdf_url || null,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const urls = await fetchSecureLessonUrl(requestedId);
    if (!isMountedRef.current) return;
    if (currentLessonIdRef.current !== requestedId) {
      // User clicked a different lesson while this one was loading — drop result.
      return;
    }
    setCurrentLesson({
      ...lesson,
      video_url: urls?.video_url || lesson.video_url || '',
      class_pdf_url: urls?.class_pdf_url || lesson.class_pdf_url || null,
    });
  };




  // Post comment
  const handlePostComment = async () => {
    if (!newComment.trim() && !commentImage) {
      toast.error("Please enter a comment or attach an image");
      return;
    }

    if (!user) {
      toast.error("Please login to comment");
      return;
    }

    if (!currentLesson?.id) return;

    setIsPostingComment(true);
    
    let imageUrl: string | undefined;
    
    // Upload image if present
    if (commentImage) {
      setUploadingImage(true);
      try {
        const filePath = `${user.id}/${Date.now()}_${commentImage.name}`;
        const { error: uploadError } = await supabase.storage
          .from("comment-images")
          .upload(filePath, commentImage);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from("comment-images")
          .getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
      } catch (err: any) {
        toast.error("Failed to upload image");
        setIsPostingComment(false);
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }
    
    const success = await createComment(
      { lessonId: currentLesson.id, message: newComment.trim() || "📷 Image", imageUrl },
      profile?.fullName || user.email || 'Anonymous'
    );

    if (success) {
      setNewComment("");
      setCommentImage(null);
      setCommentImagePreview(null);
    }
    setIsPostingComment(false);
  };

  const handleCommentImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setCommentImage(file);
    setCommentImagePreview(URL.createObjectURL(file));
  };

  const removeCommentImage = () => {
    setCommentImage(null);
    if (commentImagePreview) URL.revokeObjectURL(commentImagePreview);
    setCommentImagePreview(null);
  };

  // Revoke the blob URL whenever it changes OR on unmount. Without this,
  // navigating away with an image still selected leaks the blob — accumulates
  // on Android WebView during long sessions and contributes to OOM kills.
  useEffect(() => {
    return () => {
      if (commentImagePreview) URL.revokeObjectURL(commentImagePreview);
    };
  }, [commentImagePreview]);

  // Format relative time
  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const fromParam = resolveFromParam(searchParams, courseId);
  const fromMyCourses = fromParam === 'my-courses';
  const fromAllClasses = fromParam === 'all-classes';
  const fromCourses = fromParam === 'courses';
  const chapterParam = searchParams.get('chapter');
  const pathParam = searchParams.get('path');

  const handleBack = useCallback(() => {
    // my-courses drills subject → chapter → lessons IN-PAGE inside
    // MyCourseDetail (all on /my-courses/:id), so a bare history.back()
    // returns to the subject root and loses the user's place. Navigate to an
    // explicit restore URL (chapter + path) so the exact lesson list is
    // rebuilt. Must run BEFORE the trail check — otherwise history.back()
    // wins and dumps the user at the course root.
    if (fromMyCourses) {
      const params = new URLSearchParams();
      if (chapterParam) params.set('chapter', chapterParam);
      if (pathParam) params.set('path', pathParam);
      const qs = params.toString();
      navigate(`/my-courses/${courseId}${qs ? `?${qs}` : ''}`, { replace: true });
      return;
    }
    // Prefer the real in-app navigation trail (history path) so Back returns
    // to wherever the user actually came from (breadcrumb / web / app parity).
    const prevInTrail = navHistory.peekPrevious();
    if (prevInTrail) {
      window.history.back();
      return;
    }
    // Deterministic fallback for cold-launch / deep links (empty trail).
    // Audit fix (Batch): chapter takes priority over course/subject root.
    // Previously `fromMyCourses` short-circuited FIRST and threw the user
    // to `/my-courses/:id`, skipping the LectureListing they just came
    // from. Chapter-first mirrors the breadcrumb parent + hardware back.
    const restoreChapter = chapterParam || currentLesson?.chapter_id || '';
    if (restoreChapter) {
      const qs = fromParam ? `?from=${fromParam}` : '';
      navigate(`/classes/${courseId}/chapter/${restoreChapter}${qs}`);
    } else if (fromMyCourses) {
      const params = new URLSearchParams();
      if (pathParam) params.set('path', pathParam);
      const qs = params.toString();
      navigate(`/my-courses/${courseId}${qs ? `?${qs}` : ''}`);
    } else if (fromAllClasses) {
      navigate('/all-classes');
    } else if (fromCourses) {
      navigate(`/course/${courseId}`);
    } else {
      navigate(`/classes/${courseId}/chapters`);
    }
  }, [chapterParam, currentLesson, courseId, fromParam, fromMyCourses, fromAllClasses, fromCourses, navigate, navHistory, pathParam]);

  if (loading) {
    return <LoadingSpinner fullPage size="lg" />;
  }

  // Defensive: if loading finished but course is still null (e.g. warm cache
  // path with a pending refetch), hold a spinner instead of blinking the
  // empty state. A genuine missing course is rare here because access to this
  // route is gated by enrollment upstream.
  if (!course) return <LoadingSpinner fullPage size="lg" />;

  // Calculate Progress Logic
  const completedCount = completedLessonIds.size;
  const progressPercentage = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;

  // PDF / DPP / NOTES open in immersive full-page DocumentReader (no inline
  // chrome / bottom white strip) so students can read distraction-free.
  const isDocumentType = currentLesson && ['PDF', 'DPP', 'DPP_ATTEMPT', 'NOTES'].includes(currentLesson.lecture_type?.toUpperCase() ?? '');
  const documentUrl = currentLesson?.video_url || currentLesson?.class_pdf_url || '';
  if (isDocumentType && documentUrl) {
    return (
      <Suspense fallback={<LoadingSpinner fullPage />}>
        <DocumentReader
          title={currentLesson.title}
          subtitle={course?.title}
          badge={currentLesson.lecture_type?.toUpperCase()}
          url={documentUrl}
          lessonId={currentLesson.id}
          onBack={handleBack}
        />
      </Suspense>
    );
  }

  // Immersive PDF from Notes-sheet deep-link (?openPdf=<id>). Renders full-page
  // DocumentReader on top of the lesson view; onBack strips the query param and
  // returns the user to the normal lesson layout (attachment tab stays inline).
  if (immersivePdf && currentLesson) {
    const closeImmersive = () => {
      // If the user deep-linked into this reader from the Lecture card view
      // (?openPdf=... navigation from LectureListing), a plain "clear state"
      // leaves them stranded on the LessonView they never wanted to see.
      // Prefer popping the whole route so hardware/UI back returns to the
      // exact card view they tapped from. Fall back to the in-lesson clear
      // for callers that opened the immersive reader without a history entry
      // (e.g. Notes sheet within the same lesson).
      setImmersivePdf(null);
      const hasOpenPdfParam = searchParams.has("openPdf");
      const cameFromTrail = !!navHistory.peekPrevious();
      if (hasOpenPdfParam && cameFromTrail) {
        // handleBack already knows how to unwind to the right ancestor
        // (LectureListing / MyCourseDetail / All Classes) using the nav trail.
        handleBack();
        return;
      }
      const next = new URLSearchParams(searchParams);
      if (next.has("openPdf")) {
        next.delete("openPdf");
        setSearchParams(next, { replace: true });
      }
    };
    return (
      <Suspense fallback={<LoadingSpinner fullPage />}>
        <DocumentReader
          title={immersivePdf.title}
          subtitle={currentLesson.title}
          badge={immersivePdf.badge || "PDF"}
          url={immersivePdf.url}
          lessonId={immersivePdf.id || currentLesson.id}
          onBack={closeImmersive}
        />
      </Suspense>
    );
  }


  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Status-bar safe-area filler — black on mobile so it visually merges
          with the video frame below it (no more blank white strip between
          the system status bar and the player). Desktop keeps the regular
          card header below, so the filler is hidden there. */}
      <div
        className="lg:hidden bg-black shrink-0"
        style={{ height: "env(safe-area-inset-top, 0px)" }}
        aria-hidden="true"
      />

      {/* --- HEADER (Clean & Minimal) — desktop only --- */}
      <header className="hidden lg:flex bg-card border-b h-16 items-center px-4 lg:px-6 sticky top-0 z-30 shadow-sm pt-[env(safe-area-inset-top)]">
        <Button variant="ghost" size="icon" onClick={handleBack} className="mr-2">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Button>
        <div className="flex-1">
            <h1 className="text-sm lg:text-base font-bold text-foreground line-clamp-1">
                {course.title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Class {course.grade}</span>
                <span>• {lessons.length} Lessons</span>
            </div>
        </div>
        <div className="flex items-center gap-2">
          {!hasPurchased && (
            <Button size="sm" className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-md"
            onClick={() => navigate(`/buy-course?id=${courseId}`)}>
                Buy Now
            </Button>
          )}
        </div>
      </header>
      {/* Mobile top bar removed — was a 44px blank white strip between status
          bar and video. Back navigation is handled by:
            1. Android hardware back (useAndroidBackButton)
            2. Edge-swipe-right (useSwipeBack)
            3. Floating back chip inside the video frame (top-left, see player)
          UX feedback was that the standalone bar added zero affordance and
          broke the cinematic "video sits right under the status bar" feel
          competitors (YouTube, MX, Hotstar) ship. */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        
        {/* --- LEFT: VIDEO PLAYER & TABS (Cinema Area) --- */}
        <main className="flex-1 overflow-y-auto bg-card lg:bg-muted/20">
            <div className="max-w-5xl mx-auto lg:p-6 lg:space-y-6">
                {/* VIDEO CONTAINER — full-width, hidden when PiP mode is active */}
                {!isPiPMode && (
                <div className={cn("lg:rounded-2xl overflow-hidden relative group", !isReader && "shadow-2xl")}>
                    {/* NOTE: The always-on floating back chip was removed (2026-06-27)
                        per UX audit — it was visually distracting AND its tap was
                        being swallowed by the player's z-[55] top overlay, so the
                        button silently failed. Back navigation is still covered by:
                          1. Android hardware back (useAndroidBackButton)
                          2. Edge-swipe-right gesture (useSwipeBack)
                          3. Player's own exit arrow in fullscreen (MahimaGhostPlayer) */}
                    {currentLesson && (['PDF', 'DPP', 'DPP_ATTEMPT', 'NOTES'].includes(currentLesson.lecture_type?.toUpperCase() ?? '')) ? (
                      <PdfViewer
                        url={currentLesson.video_url || currentLesson.class_pdf_url || ''}
                        title={currentLesson.title}
                        filename={currentLesson.title}
                      />
                    ) : currentLesson && currentLesson.video_url ? (
                        <UnifiedVideoPlayer
                            url={currentLesson.video_url}
                            lessonId={currentLesson.id}
                            title={currentLesson.title}
                            subtitle={currentLesson.created_at ? new Date(currentLesson.created_at).toLocaleDateString('en-GB') + (course?.title ? ` · ${course.title}` : '') : (course?.title ?? undefined)}
                            onReady={() => {
                              playerReadyRef.current = true;
                              const pending = pendingResumeRef.current;
                              if (pending != null) {
                                pendingResumeRef.current = null;
                                dispatchResumeSeek(pending);
                              }
                            }}
                            onDurationReady={(dur) => setVideoDuration(dur)}
                            onTimeUpdate={handleVideoTimeUpdate}
                        />
                    ) : (
                        <div className="aspect-video bg-black flex items-center justify-center rounded-2xl">
                            <p className="text-white/50">Select a lesson to watch</p>
                        </div>
                    )}

                    {/* Locked Overlay */}
                    {currentLesson && !canAccessLesson(currentLesson) && (
                        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center z-20 text-center p-6">
                            <div className="bg-white/10 p-4 rounded-full mb-4">
                                <Lock className="h-8 w-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Content Locked</h2>
                            <p className="text-gray-300 mb-6 max-w-md">
                                This premium lesson is part of the full course. Unlock instant access to all {lessons.length} lessons.
                            </p>
                            <Button size="lg" className="bg-green-500 hover:bg-green-600 text-white font-bold px-8"
                                onClick={() => navigate(`/buy-course?id=${courseId}`)}>
                                Unlock Full Course
                            </Button>
                        </div>
                    )}
                </div>
                )}

                {/* Floating PiP Video Player — DISABLED to prevent overlay on PDF/sidebar */}

                {/* PDF Select Popup — still mounted for chip-strip multi-PDF selection */}
                {currentLesson && (() => {
                  const allPdfs: PdfItem[] = [];
                  if (currentLesson.class_pdf_url) {
                    allPdfs.push({ id: 'class-pdf', file_name: 'Class PDF', file_url: currentLesson.class_pdf_url });
                  }
                  lessonPdfs.forEach(p => allPdfs.push({ id: p.id, file_name: p.file_name, file_url: p.file_url, file_size: p.file_size }));
                  return (
                    <PdfSelectPopup
                      open={showPdfPopup}
                      onOpenChange={setShowPdfPopup}
                      pdfs={allPdfs}
                      onSelect={(pdf) => { void openPdfItem(pdf); }}
                    />
                  );
                })()}

                {/* PDF Download picker — same list as the top-of-lesson
                    "PDF Download" button. Selecting a row triggers the
                    in-app download pipeline (never an external redirect). */}
                {currentLesson && (() => {
                  const downloadablePdfs: PdfItem[] = [];
                  if (currentLesson.class_pdf_url && currentLesson.class_pdf_url.trim() !== "") {
                    downloadablePdfs.push({ id: "class-pdf", file_name: `${currentLesson.title || "Lesson"} — Class PDF`, file_url: currentLesson.class_pdf_url });
                  }
                  lessonPdfs.forEach((p) => {
                    downloadablePdfs.push({ id: p.id, file_name: p.file_name, file_url: p.file_url, file_size: p.file_size });
                  });
                  return (
                    <PdfSelectPopup
                      open={showPdfDownloadPopup}
                      onOpenChange={setShowPdfDownloadPopup}
                      pdfs={downloadablePdfs}
                      onSelect={(pdf) => { void downloadPdfItem(pdf); }}
                    />
                  );
                })()}

                {/* INFO & TABS */}
                <div className={cn("pb-10", isReader ? "px-0 space-y-0" : "px-4 lg:px-0 space-y-3")}>

                    {/* Lesson Title + meta (duration • date) + description.
                        Auto-hides smoothly (together with the chip strip) when a PDF is
                        open and chrome has timed out. Uses opacity + max-height so the
                        chips below don't snap — no display:none flicker. */}
                    {currentLesson && (() => {
                       const collapsed = isReader && !chromeVisible;
                      return (
                        <div
                          className={cn(
                            "overflow-hidden transition-[opacity,max-height,padding] duration-300 ease-out",
                            collapsed
                              ? "opacity-0 max-h-0 py-0 pointer-events-none"
                              : "opacity-100 max-h-[400px] py-2"
                          )}
                          aria-hidden={collapsed}
                        >
                          <div className="space-y-1">
                            <h1 className="text-base md:text-lg font-semibold text-foreground leading-snug line-clamp-2">
                              {currentLesson.title || "Course Introduction"}
                            </h1>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {videoDuration > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDuration(videoDuration)}
                                </span>
                              )}
                              {currentLesson.created_at && (
                                <span>
                                  {new Date(currentLesson.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                            {/* Replaced video description with Like + Rating summary (per product spec). */}
                            <div className="mt-2 flex items-center gap-4 flex-wrap">
                              <button
                                type="button"
                                onClick={() => toggleLike()}
                                disabled={likesLoading}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors",
                                  hasLiked
                                    ? "bg-primary/10 border-primary/30 text-primary"
                                    : "bg-transparent border-border text-foreground hover:bg-accent/30"
                                )}
                                aria-label="Like lesson"
                              >
                                <ThumbsUp className={cn("h-4 w-4", hasLiked && "fill-current")} />
                                <span className="font-medium">{likeCount}</span>
                                <span className="hidden sm:inline">{hasLiked ? "Liked" : "Like"}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setActiveChip("rating")}
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border border-border bg-transparent text-foreground hover:bg-accent/30"
                                aria-label="Rate lesson"
                              >
                                <div className="flex">
                                  {[1,2,3,4,5].map((s) => (
                                    <Star key={s}
                                      className={cn(
                                        "h-4 w-4",
                                        (ratingAvg >= s - 0.25) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                                      )}
                                    />
                                  ))}
                                </div>
                                <span className="font-medium">{ratingAvg ? ratingAvg.toFixed(1) : "—"}</span>
                                <span className="text-muted-foreground">({ratingCount})</span>
                              </button>

                              {(() => {
                                // Collect every downloadable PDF for the CTA. Attachments
                                // are excluded — they already have per-row download buttons
                                // in the Attachment chip, and mixing them here would double
                                // up the affordance.
                                const downloadablePdfs: PdfItem[] = [];
                                if (currentLesson?.class_pdf_url && currentLesson.class_pdf_url.trim() !== "") {
                                  downloadablePdfs.push({ id: "class-pdf", file_name: `${currentLesson.title || "Lesson"} — Class PDF`, file_url: currentLesson.class_pdf_url });
                                }
                                lessonPdfs.forEach((p) => {
                                  downloadablePdfs.push({ id: p.id, file_name: p.file_name, file_url: p.file_url, file_size: p.file_size });
                                });
                                if (downloadablePdfs.length === 0) return null;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Single PDF → download immediately. Multiple → picker.
                                      if (downloadablePdfs.length === 1) {
                                        void downloadPdfItem(downloadablePdfs[0]);
                                        return;
                                      }
                                      setShowPdfDownloadPopup(true);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border border-border bg-transparent text-foreground hover:bg-accent/30"
                                    aria-label={downloadablePdfs.length === 1 ? "Download PDF" : "Choose a PDF to download"}
                                  >
                                    <Download className="h-4 w-4" />
                                    <span className="font-medium">PDF Download</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* TABS COMPONENT — horizontal pill chips */}
                    <div ref={tabsRef}>
                    {currentLesson && (
                    <div className={cn("w-full", isReader ? "mt-0" : "mt-2")}>
                      {/* Pill chip strip — auto-hides while reading PDF. Floating glass-card look. */}
                      <div
                        className={cn(
                          "nb-snap-x flex items-center gap-2 overflow-x-auto scrollbar-hide transition-all duration-300",
                          isReader && !chromeVisible
                            ? "hidden"
                            : "mx-3 lg:mx-0 mb-3 px-3 py-2 rounded-full bg-card/85 backdrop-blur-md border border-border/60 shadow-[0_4px_16px_-6px_rgb(0_0_0/0.12)]"
                        )}
                      >

                        {[
                          { id: "comments",   label: "Comments",   icon: MessageCircle },
                          { id: "attachment", label: "Attachment", icon: Paperclip },
                          ...((hasNotes || isAdminOrTeacher) ? [{ id: "notes", label: "Smart Notes", icon: FileText, iconSrc: notesFireIcon }] : []),
                          { id: "ask-doubt",  label: "Ask Doubt",  icon: HelpCircle },
                          { id: "timeline",   label: "Timeline",   icon: ListVideo },
                          { id: "my-doubts",  label: "My Doubts",  icon: MessageSquare },
                          { id: "bookmarks",  label: "Bookmarks",  icon: BookmarkIcon },
                          { id: "mentors",    label: "Mentors",    icon: Users },
                          { id: "like",       label: hasLiked ? `Liked${likeCount > 0 ? ` ${likeCount}` : ''}` : (likeCount > 0 ? `Like ${likeCount}` : "Like"), icon: ThumbsUp, action: "like" as const },
                          { id: "rating",     label: "Rating",     icon: Star },
                        ].map((item) => {
                          const { id, label, icon: Icon } = item;
                          const iconSrc = (item as { iconSrc?: string }).iconSrc;
                          const action = (item as { action?: "like" }).action;
                          const isLikeChip = action === "like";
                          const active = isLikeChip ? hasLiked : activeChip === id;
                          return (
                            <button
                              key={id}
                              onClick={() => {
                                if (action === "like") { toggleLike(); return; }
                                setActiveChip(id);
                              }}
                              disabled={isLikeChip && likesLoading}
                              className={cn(
                                "shrink-0 min-h-11 inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors",
                                active
                                  ? "bg-foreground text-background border-foreground"
                                  : "bg-transparent text-foreground border-border hover:bg-accent/30"
                              )}
                            >
                              {iconSrc ? (
                                <img src={iconSrc} alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
                              ) : (
                                <Icon className={cn("h-4 w-4", isLikeChip && hasLiked && "fill-current")} />
                              )}
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Panel content */}
                      <div className={cn(
                        "overflow-hidden",
                        isReader || isNotesPanel
                          ? "bg-card -mx-4 lg:mx-0 mt-0"
                          : activeChip === "ask-doubt"
                            ? "mt-2 bg-transparent"
                            : "bg-card rounded-xl border border-border shadow-sm mt-2"
                      )}>

                        {activeChip === "timeline" && (
                          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                            Timeline markers coming soon.
                          </div>
                        )}

                        {activeChip === "notes" && (
                          hasNotes ? (
                            <div
                              className="relative w-full"
                              onClick={revealChrome}
                              onTouchStart={revealChrome}
                              onMouseMove={revealChrome}
                            >
                              {/* Floating Copy / Download / Open-fullscreen chip — auto-hides with chrome */}
                              {chromeVisible && (
                                <div
                                  className="absolute right-2 z-30 flex items-center gap-1 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-md px-1 py-1"
                                  style={{ top: 'max(8px, env(safe-area-inset-top))' }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => copyChatText(currentLesson!.transcript_md || "")}
                                    title="Copy notes"
                                    aria-label="Copy notes"
                                    className="h-7 w-7 rounded-full inline-flex items-center justify-center text-foreground hover:bg-accent/40 transition-colors"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const fileName = `${(currentLesson?.title || "lesson").replace(/[^\w.-]+/g, "_")}-smart-notes.md`;
                                        // Prefer in-progress draft so users can download what they're editing
                                        // even before the Save round-trip lands; fall back to saved transcript.
                                        const md = smartNotesDraft?.trim() ? smartNotesDraft : (currentLesson?.transcript_md || "");
                                        if (!md.trim()) {
                                          toast.error("Notes khaali hain — pehle kuchh likhein ya upload karein.");
                                          return;
                                        }
                                        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                                        const url = URL.createObjectURL(blob);
                                        // Use "MD" so the Downloads viewer routes to MarkdownViewer
                                        // (NOTES would force the PDF reader and fail to parse markdown).
                                        // Pass the blob directly so we never re-fetch a (possibly stale) blob: URL.
                                        await addDownload(fileName, url, fileName, "MD", blob);
                                        setTimeout(() => URL.revokeObjectURL(url), 5_000);
                                        toast.success("Saved to Downloads");
                                      } catch (err: any) {
                                        toast.error(err?.message || "Download failed");
                                      }
                                    }}
                                    title="Download notes"
                                    aria-label="Download notes"
                                    className="h-7 w-7 rounded-full inline-flex items-center justify-center text-foreground hover:bg-accent/40 transition-colors"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setInlineReadingMode((v) => !v)}
                                    title={inlineReadingMode ? "Exit Reading mode" : "Reading mode (sepia)"}
                                    aria-label="Toggle Reading mode"
                                    aria-pressed={inlineReadingMode}
                                    className={cn(
                                      "h-7 w-7 rounded-full inline-flex items-center justify-center transition-colors",
                                      inlineReadingMode
                                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                        : "text-foreground hover:bg-accent/40",
                                    )}
                                  >
                                    <BookOpen className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setSmartNotesReadingMode("off"); setSmartNotesSheetOpen(true); }}
                                    title="Open fullscreen"
                                    aria-label="Open fullscreen"
                                    className="h-7 px-2 rounded-full inline-flex items-center gap-1 bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-opacity"
                                  >
                                    Open
                                  </button>
                                </div>
                              )}
                              {/* Edge-to-edge markdown body, smooth scroll.
                                  Inline reading mode applies a sepia surface
                                  without opening the fullscreen reader. */}
                              <div
                                ref={inlineNotesScrollRef}
                                className={cn(
                                  "overflow-y-auto overflow-x-auto px-4 sm:px-6 pt-3 pb-10 transition-colors",
                                  inlineReadingMode && "bg-reading-sepia text-reading-sepia-foreground",
                                )}
                                style={{ scrollBehavior: "smooth", maxHeight: "calc(100dvh - 220px)" }}
                              >
                                <ObsidianMarkdown>{currentLesson!.transcript_md!}</ObsidianMarkdown>
                              </div>
                              {/* Inline Auto-Scroll FAB — scrolls the notes container above */}
                              <AutoScrollFab targetRef={inlineNotesScrollRef} bottomOffset={24} />
                            </div>
                          ) : (
                            <div className="w-full px-4 sm:px-6 pt-4 pb-10">
                              {isAdminOrTeacher && currentLesson && (
                                <div className="mb-4">
                                  <div className="flex items-center justify-between gap-2 mb-3">
                                    <div className="flex items-center gap-2">
                                      <div className="h-8 w-8 rounded-lg bg-primary/10 inline-flex items-center justify-center">
                                        <FileText className="h-4 w-4 text-primary" />
                                      </div>
                                      <div>
                                        <p className="text-sm font-semibold text-foreground leading-tight">Smart Notes</p>
                                        <p className="text-[11px] text-muted-foreground leading-tight">Admin upload · Markdown</p>
                                      </div>
                                    </div>
                                    {!smartNotesEditing ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSmartNotesDraft(currentLesson.transcript_md || "");
                                          setSmartNotesEditing(true);
                                        }}
                                        className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 font-medium shadow-sm"
                                      >
                                        {currentLesson.transcript_md ? "Edit" : "Add notes"}
                                      </button>
                                    ) : (
                                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                                        <label
                                          title="Upload file (md / pdf / image)"
                                          className="h-8 inline-flex items-center gap-1.5 px-2 sm:px-3 rounded-full border border-border bg-card hover:bg-accent/40 text-foreground cursor-pointer text-xs font-medium transition-colors"
                                        >
                                          <UploadIcon className="h-3.5 w-3.5" />
                                          <span className="hidden sm:inline">Upload</span>
                                          <input
                                            type="file"
                                            accept=".md,.markdown,.txt,text/markdown,text/plain,application/pdf,.pdf,image/*,.jpg,.jpeg,.png,.webp,.gif"
                                            className="hidden"
                                            onChange={async (e) => {
                                              const f = e.target.files?.[0];
                                              if (f) await importFileToDraft(f);
                                              e.target.value = "";
                                            }}
                                          />
                                        </label>

                                        <button
                                          type="button"
                                          disabled={smartNotesImportProgress !== null}
                                          onClick={() => setSmartNotesLinkDialogOpen(true)}
                                          title="Import from URL"
                                          className="h-8 inline-flex items-center gap-1.5 px-2 sm:px-3 rounded-full border border-border bg-card hover:bg-accent/40 text-foreground text-xs font-medium disabled:opacity-60 transition-colors"
                                        >
                                          <LinkIcon className="h-3.5 w-3.5" />
                                          <span className="hidden sm:inline">{smartNotesImportProgress !== null ? `Importing ${smartNotesImportProgress}%` : "Link"}</span>
                                        </button>

                                        {currentLesson.transcript_md && (
                                          <button
                                            type="button"
                                            disabled={smartNotesSaving}
                                            onClick={async () => {
                                              if (!currentLesson?.id) return;
                                              if (!window.confirm("Delete Smart Notes for this lesson? This cannot be undone.")) return;
                                              setSmartNotesSaving(true);
                                              const { error } = await supabase
                                                .from("lessons")
                                                .update({ transcript_md: null })
                                                .eq("id", currentLesson.id);
                                              setSmartNotesSaving(false);
                                              if (error) { toast.error(error.message || "Delete failed"); return; }
                                              setCurrentLesson((prev) => prev ? { ...prev, transcript_md: null } : prev);
                                              setSmartNotesDraft("");
                                              setSmartNotesEditing(false);
                                              toast.success("Smart Notes deleted");
                                            }}
                                            title="Delete Smart Notes"
                                            className="h-8 inline-flex items-center gap-1.5 px-2 sm:px-3 rounded-full border border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10 text-xs font-medium disabled:opacity-50 transition-colors"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            <span className="hidden sm:inline">Delete</span>
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          disabled={smartNotesSaving}
                                          onClick={async () => {
                                            if (!currentLesson?.id) return;
                                            setSmartNotesSaving(true);
                                            const { error } = await supabase
                                              .from("lessons")
                                              .update({ transcript_md: smartNotesDraft || null })
                                              .eq("id", currentLesson.id);
                                            setSmartNotesSaving(false);
                                            if (error) {
                                              toast.error(error.message || "Save failed");
                                              return;
                                            }
                                            setCurrentLesson((prev) => prev ? { ...prev, transcript_md: smartNotesDraft || null } : prev);
                                            setSmartNotesEditing(false);
                                            toast.success("Smart Notes saved");
                                          }}
                                          title="Save Smart Notes"
                                          className="h-8 inline-flex items-center gap-1.5 px-3 sm:px-4 rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 text-xs font-semibold shadow-sm transition-opacity"
                                        >
                                          {smartNotesSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                          {smartNotesSaving ? "Saving" : "Save"}
                                        </button>
                                        <button
                                          type="button"
                                          title="Discard changes"
                                          onClick={() => setSmartNotesEditing(false)}
                                          className="h-8 inline-flex items-center px-3 rounded-full text-foreground/80 hover:bg-accent/40 text-xs font-medium transition-colors"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {smartNotesEditing && (
                                    <div
                                      className={cn(
                                        "relative overflow-hidden rounded-xl border bg-card transition-colors",
                                        smartNotesDragOver ? "border-primary ring-2 ring-primary/30" : "border-border/70"
                                      )}
                                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!smartNotesDragOver) setSmartNotesDragOver(true); }}
                                      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setSmartNotesDragOver(false); }}
                                      onDrop={async (e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        setSmartNotesDragOver(false);
                                        const f = e.dataTransfer.files?.[0];
                                        if (f) await importFileToDraft(f);
                                      }}
                                    >
                                      {smartNotesImportProgress !== null && (
                                        <div className="absolute left-0 right-0 top-0 h-0.5 bg-primary/15 z-10">
                                          <div
                                            className="h-full bg-primary transition-[width] duration-300"
                                            style={{ width: `${smartNotesImportProgress}%` }}
                                          />
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-border/40">
                                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Markdown</span>
                                        <span className="text-[10px] text-muted-foreground/70">{smartNotesDraft.length.toLocaleString()} chars</span>
                                      </div>
                                      <textarea
                                        ref={smartNotesEditorRef}
                                        value={smartNotesDraft}
                                        onChange={(e) => setSmartNotesDraft(e.target.value)}
                                        placeholder="# Heading&#10;&#10;Paste or write Markdown notes here — ya file drag-drop karein…"
                                        className="block w-full min-h-[320px] resize-y bg-transparent px-4 py-3 text-base md:text-[13px] font-mono leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                                      />
                                      {smartNotesDragOver && (
                                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/5 backdrop-blur-[1px]">
                                          <div className="flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold shadow-lg">
                                            <UploadIcon className="h-3.5 w-3.5" /> Drop to import
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {!smartNotesEditing && (
                                <div className="text-center py-20 px-6">
                                  <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/[0.02] border border-primary/15 mx-auto flex items-center justify-center mb-5 shadow-sm">
                                    <FileText className="h-9 w-9 text-primary/70" strokeWidth={1.5} />
                                  </div>
                                  <p className="text-[17px] font-semibold text-foreground tracking-tight">Smart Notes abhi available nahi</p>
                                  <p className="text-[13px] leading-relaxed text-muted-foreground mt-2 max-w-[280px] mx-auto">
                                    Admin is lesson ke liye Markdown notes upload karenge — yahaan inline, full screen dikhenge.
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        )}

                        {activeChip === "attachment" && (
                          selectedPdf ? (
                            // Edge-to-edge distraction-free PDF view.
                            // Tap reveals chrome (back arrow + title + chip strip); they auto-hide after ~2.5s.
                            <div
                              className="relative w-full"
                              onClick={revealChrome}
                              onTouchStart={revealChrome}
                              onMouseMove={revealChrome}
                            >
                              {/* Removed: floating PDF toolbar (ListVideo/X toggle).
                                  Download / Export / Close now live on the PdfViewer's
                                  own header chrome; autoscroll FAB stays untouched.
                                  User request 2026-07-11. */}
                              <PdfViewer
                                url={selectedPdf.file_url}
                                title={selectedPdf.file_name}
                                filename={selectedPdf.file_name}
                                chromeVisible={true}
                                onDownloaded={({ title, url, filename }) => addDownload(title, url, filename, "PDF")}
                              />
                            </div>
                          ) : (pdfsLoading || attachmentsLoading) ? (
                            // Skeleton while attachments/PDFs load — surfaces progress
                            // before the viewer opens (especially for the `?openPdf=` deep-link).
                            <div className="px-4 py-4 space-y-3" aria-busy="true" aria-label="Loading attachments">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className="flex items-center gap-3 py-2.5">
                                  <div className="h-7 w-7 rounded-md bg-muted animate-pulse flex-shrink-0" />
                                  <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="px-4 py-4 space-y-3">
                                {/* Notes (PDF list) */}
                                {(currentLesson?.class_pdf_url || lessonPdfs.length > 0) && (
                                  <div>
                                    <button
                                      type="button"
                                      onClick={() => setNotesOpen(v => !v)}
                                      className="w-full flex items-center justify-between py-2 text-left"
                                      aria-expanded={notesOpen}
                                    >
                                      <h3 className="font-semibold text-base text-foreground">Notes</h3>
                                      {notesOpen
                                        ? <ChevronUp className="h-5 w-5 text-muted-foreground" />
                                        : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                                    </button>
                                    <div
                                      className={cn(
                                        "overflow-hidden transition-all duration-200 ease-out",
                                        notesOpen ? "max-h-[2000px] opacity-100 mt-1" : "max-h-0 opacity-0"
                                      )}
                                    >
                                      <div className="space-y-1 pl-2">
                                        {currentLesson?.class_pdf_url && (
                                          <button
                                            onClick={() => void openPdfItem({ id: 'class-pdf', file_name: `${currentLesson.title} : Class Notes`, file_url: currentLesson.class_pdf_url! })}
                                            className="flex items-center gap-3 py-2.5 w-full text-left hover:bg-accent/10 active:bg-accent/20 active:scale-[0.99] rounded-md px-2 transition-all duration-150 ease-out"
                                          >
                                            <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center flex-shrink-0">
                                              <FileText className="h-3.5 w-3.5 text-destructive" />
                                            </div>
                                            <p className="flex-1 min-w-0 text-[15px] text-foreground truncate">{currentLesson.title} : Class Notes</p>
                                          </button>
                                        )}
                                        {lessonPdfs.map((pdf) => (
                                          <button
                                            key={pdf.id}
                                            onClick={() => void openPdfItem({ id: pdf.id, file_name: pdf.file_name, file_url: pdf.file_url })}
                                            className="flex items-center gap-3 py-2.5 w-full text-left hover:bg-accent/10 active:bg-accent/20 active:scale-[0.99] rounded-md px-2 transition-all duration-150 ease-out"
                                          >
                                            <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center flex-shrink-0">
                                              <FileText className="h-3.5 w-3.5 text-destructive" />
                                            </div>
                                            <p className="flex-1 min-w-0 text-[15px] text-foreground truncate">{pdf.file_name}</p>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}


                                {/* Generic file attachments (any kind — pdf, doc, image, video, audio, other) */}
                                {lessonAttachments.length > 0 && (
                                  <div>
                                    <h3 className="font-semibold text-base text-foreground mt-3 mb-1">Attachments</h3>
                                    <div className="space-y-1 pl-2">
                                      {lessonAttachments.map((att) => (
                                        <AttachmentRow
                                          key={att.id}
                                          attachment={att}
                                          onOpenPdf={(url, fileName) => void openPdfItem({ id: att.id, file_name: fileName, file_url: url })}
                                          resolveUrl={() => getAttachmentUrl(att)}
                                          onDownloaded={(title, url, filename, kind) => addDownload(title, url, filename, kind)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {!currentLesson?.class_pdf_url && lessonPdfs.length === 0 && lessonAttachments.length === 0 && !pdfsLoading && !attachmentsLoading && (
                                  <p className="text-center text-sm text-muted-foreground py-6">No attachments available for this lesson.</p>
                                )}
                            </div>
                          )
                        )}

                        {activeChip === "bookmarks" && (
                          <BookmarksPanel lessonId={currentLesson.id} />
                        )}

                        {activeChip === "mentors" && (
                          <div className="px-4 py-4 space-y-4">
                            <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              Personal Mentors
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Aapke liye dedicated mentors — direct guidance ke liye contact karein.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {[
                                { name: "Raj VIP Sir", role: "Founder & Lead English Mentor", phone: "+91 91258 38309", email: "raj@safarenglish.in", initials: "RV" },
                                { name: "Priya Ma'am", role: "Spoken English Mentor", phone: "+91 91258 38309", email: "priya@safarenglish.in", initials: "PM" },
                                { name: "Rahul Sir", role: "Grammar Mentor", phone: "+91 91258 38309", email: "rahul@safarenglish.in", initials: "RS" },
                                { name: "Anjali Ma'am", role: "CG Lecturer Prep Mentor", phone: "+91 91258 38309", email: "anjali@safarenglish.in", initials: "AM" },
                              ].map((m) => (
                                <div key={m.name} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20">
                                  <div className="h-11 w-11 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                                    {m.initials}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm text-foreground">{m.name}</div>
                                    <div className="text-xs text-muted-foreground mb-2">{m.role}</div>
                                    <div className="flex flex-wrap gap-2">
                                      <a href={`tel:${m.phone.replace(/\s/g,'')}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                        <Phone className="h-3 w-3" /> Call
                                      </a>
                                      <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                        <Mail className="h-3 w-3" /> Email
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {activeChip === "ask-doubt" && currentLesson && (
                          <AskDoubtSheet
                            inline
                            open={true}
                            onClose={() => setActiveChip("comments")}
                            chatMessages={chatMessages}
                            chatBusy={chatBusy}
                            chatInput={chatInput}
                            setChatInput={setChatInput}
                            sendChat={sendChat}
                            regenerateLast={regenerateLast}
                            askingName={askingName}
                            getVideoTime={getVideoTime}
                            suggestions={SARTHI_SUGGESTIONS}
                            lessonTitle={currentLesson.title}
                            persistKey={currentLesson.id}
                            saveAnswer={async (md, idx) => {
                              try {
                                const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                                const safe = (currentLesson.title || "doubt").replace(/[^\w.-]+/g, "_").slice(0, 60);
                                const fileName = `${safe}-doubt-${idx + 1}-${stamp}.md`;
                                const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                                const url = URL.createObjectURL(blob);
                                // Pass the blob directly (5th arg) so the offline copy is written to IndexedDB / Filesystem.
                                // Without it, the save path tries to fetch() a blob: URL — unreliable on Android WebView —
                                // and falls back to storing only the soon-to-be-revoked URL, producing "Offline copy missing".
                                // Use "MD" so the Downloads viewer routes to MarkdownViewer (same as Smart Notes save).
                                await addDownload(fileName, url, fileName, "MD", blob);
                                toast.success("Saved to Downloads");
                                setTimeout(() => URL.revokeObjectURL(url), 5_000);
                              } catch (err: any) {
                                toast.error(err?.message || "Save failed");
                              }
                            }}
                          />
                        )}

                        {activeChip === "my-doubts" && (
                          <div className="px-4 py-4">
                            <h3 className="font-semibold text-base text-foreground mb-3 flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-primary" />
                              My Doubts
                            </h3>
                            {commentsLoading ? (
                              <div className="text-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                              </div>
                            ) : (() => {
                              const mine = comments.filter(c => user && c.userId === user.id);
                              if (mine.length === 0) {
                                return (
                                  <div className="text-center py-8 text-muted-foreground">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                                    <p className="text-sm">You haven't posted any doubts yet.</p>
                                  </div>
                                );
                              }
                              return (
                                <div className="space-y-3">
                                  {mine.map((comment) => (
                                    <div key={comment.id} className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                                        {comment.userName?.charAt(0)?.toUpperCase() || '?'}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="font-medium text-foreground text-sm">{comment.userName}</span>
                                          <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
                                        </div>
                                        <p className="text-foreground text-sm whitespace-pre-wrap">{comment.message}</p>
                                        {comment.imageUrl && (
                                          <SmartImage src={comment.imageUrl} width={320} height={240} alt="" className="mt-2 max-w-xs rounded-lg border object-contain" />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {activeChip === "rating" && (
                          <div className="px-4 py-6">
                            <h3 className="font-semibold text-base text-foreground mb-2 flex items-center gap-2">
                              <Star className="h-4 w-4 text-amber-500" />
                              Rate this Lesson
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4">Aapka feedback humare liye important hai.</p>
                            <div className="flex items-center gap-2 mb-4" onMouseLeave={() => setRatingHover(0)}>
                              {[1, 2, 3, 4, 5].map((star) => {
                                const filled = (ratingHover || ratingValue) >= star;
                                return (
                                  <button
                                    key={star}
                                    onClick={() => setRatingValue(star)}
                                    onMouseEnter={() => setRatingHover(star)}
                                    className="p-1 transition-transform hover:scale-110"
                                    aria-label={`${star} star`}
                                  >
                                    <Star className={cn("h-8 w-8", filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                                  </button>
                                );
                              })}
                            </div>
                            <Textarea
                              placeholder="Share your feedback (optional)..."
                              value={ratingComment}
                              onChange={(e) => setRatingComment(e.target.value)}
                              className="min-h-[80px] resize-none mb-3"
                            />
                            <Button
                              disabled={ratingValue === 0 || ratingSaving || !user}
                              onClick={submitRating}
                              className="gap-2"
                            >
                              {ratingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              {ratingSubmitted ? "Update Rating" : "Submit Rating"}
                            </Button>
                            {ratingCount > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Average {ratingAvg.toFixed(1)} ★ from {ratingCount} student{ratingCount === 1 ? "" : "s"}
                              </p>
                            )}
                          </div>
                        )}

                        {activeChip === "comments" && (
                          <div className="px-4 py-4">
                            <div className="space-y-6">
                                <h3 className="font-semibold text-lg flex items-center gap-2 text-foreground">
                                    <MessageCircle className="h-5 w-5 text-primary" />
                                    Comments ({comments.length})
                                </h3>

                                {/* Comments List */}
                                <div className="space-y-4">
                                    {commentsLoading ? (
                                        <div className="text-center py-8">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                        </div>
                                    ) : comments.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <MessageCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                                            <p>No comments yet. Open <span className="font-semibold">Ask Doubt</span> to start the discussion.</p>
                                        </div>
                                    ) : (
                                        comments.map((comment) => (
                                            <div key={comment.id} className="flex gap-3 p-4 bg-muted/30 rounded-lg">
                                                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                                                    {comment.userName?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-foreground text-sm">
                                                            {comment.userName}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatRelativeTime(comment.createdAt)}
                                                        </span>
                                                    </div>
                                                    <p className="text-foreground text-sm whitespace-pre-wrap">
                                                        {comment.message}
                                                    </p>
                                                    {comment.imageUrl && (
                                                        <SmartImage
                                                            src={comment.imageUrl}
                                                            width={320}
                                                            height={240}
                                                            alt="Comment attachment"
                                                            className="mt-2 max-w-xs rounded-lg border cursor-pointer hover:opacity-90 transition-opacity object-contain"
                                                            onClick={() => void openResource({ url: comment.imageUrl!, kind: 'image' })}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Bottom comment input — quick add */}
                            <div
                              className="sticky bottom-0 -mx-4 mt-4 bg-background/95 backdrop-blur border-t border-border px-4 py-3 flex items-center gap-2"
                              style={{ paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))" }}
                            >

                              <input
                                type="text"
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handlePostComment();
                                  }
                                }}
                                aria-label="Write Comment"
                                placeholder="Write Comment"
                                className="flex-1 bg-transparent text-base md:text-sm text-foreground placeholder:text-muted-foreground outline-none py-2"
                              />
                              <button
                                onClick={handlePostComment}
                                disabled={isPostingComment || (!newComment.trim() && !commentImage)}
                                aria-label="Send comment"
                                className="text-primary disabled:text-muted-foreground/40 transition-colors p-3 -m-1.5"
                              >
                                {isPostingComment ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                    </div>

                    {/* DPP / Quiz Section */}
                    {(lessonDpps.length > 0 || dppsLoading) && (
                      <Card className="border border-border">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                            <Target className="h-4 w-4 text-primary" />
                            Attempt DPP
                            {lessonDpps.length > 0 && (
                              <Badge variant="secondary" className="ml-auto">{lessonDpps.length}</Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          {dppsLoading ? (
                            <div className="py-6 text-center">
                              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              {lessonDpps.map((dpp) => (
                                <button
                                  key={dpp.id}
                                  onClick={() => navigate(`/quiz/${dpp.id}`)}
                                  className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/10 transition-colors group"
                                >
                                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <Target className="h-4 w-4 text-primary" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{dpp.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {dpp.type?.toUpperCase() || "DPP"}
                                      {dpp.total_marks ? ` · ${dpp.total_marks} marks` : ""}
                                    </p>
                                  </div>
                                  <Badge variant="outline" className="text-xs shrink-0">Attempt</Badge>
                                </button>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Video Recommendations removed — distracting element */}
                </div>
            </div>
        </main>

      </div>
      {currentLesson && (
        <SmartNotesListSheet
          open={smartNotesSheetOpen}
          onOpenChange={setSmartNotesSheetOpen}
          lessonId={currentLesson.id}
          courseId={currentLesson.course_id ?? undefined}
          seedContent={currentLesson.transcript_md || ""}
          defaultTitle={currentLesson.title}
          onOpenNote={(n) => { setSmartNotesActiveId(n.id); setSmartNotesOpen(true); }}
        />
      )}
      {smartNotesOpen && currentLesson && (
        <SmartNotesReader
          title={`${currentLesson.title} · Smart Notes`}
          markdown={currentLesson.transcript_md || ""}
          lessonId={smartNotesActiveId ? null : currentLesson.id}
          courseId={smartNotesActiveId ? null : (currentLesson.course_id ?? undefined)}
          noteId={smartNotesActiveId}
          defaultReadingMode={smartNotesReadingMode}
          onBack={() => { setSmartNotesOpen(false); setSmartNotesActiveId(null); setSmartNotesReadingMode("off"); }}
          onDownload={async () => {
            try {
              const fileName = `${currentLesson.title.replace(/[^\w.-]+/g, "_")}-smart-notes.md`;
              const md = currentLesson.transcript_md || "";
              if (!md.trim()) {
                toast.error("Notes khaali hain — pehle Save karein.");
                return;
              }
              const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              // "MD" → Downloads opens with MarkdownViewer (not the PDF reader).
              // Pass blob directly — avoids "NetworkError" when the blob: URL goes stale.
              await addDownload(fileName, url, fileName, "MD", blob);
              toast.success("Smart Notes saved to Downloads");
              setTimeout(() => URL.revokeObjectURL(url), 5_000);
            } catch (err) {
              toast.error((err as Error)?.message || "Save failed");
            }
          }}
        />
      )}

      <SmartNotesLinkDialog
        open={smartNotesLinkDialogOpen}
        onOpenChange={setSmartNotesLinkDialogOpen}
        onImport={importUrlToDraft}
        progress={smartNotesImportProgress}
      />

    </div>
  );
};




export default LessonView;
