import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { useLessonNotes, type LessonNote } from "../../hooks/useLessonNotes";
import { AttachmentRow } from "./AttachmentRow";
import { FileText, Download } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import { toast } from "sonner";
import DocReaderShell from "../library/DocReaderShell";
import { useDownloads } from "../../hooks/useDownloads";
import { isGoogleDocs, isGoogleDrive, isNotion, googleDrivePdfProxyUrl } from "../../lib/pdfViewerUrl";
import { openResource } from "../../lib/openResource";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string | number;
}

export function LessonAttachmentsSheet({ open, onOpenChange, lessonId, lessonTitle, courseId }: Props) {
  const { notes, loading, getResolvedUrl } = useLessonNotes(open ? lessonId : undefined);
  const { addDownload } = useDownloads();
  const [viewer, setViewer] = useState<{ url: string; title: string; note?: LessonNote } | null>(null);
  // Guard so the auto-open runs at most once per (open, lessonId) cycle —
  // otherwise the effect would re-fire every render while the sheet is open.
  const autoOpenedForRef = useRef<string | null>(null);

  const handleOpenPdf = useCallback(async (url: string, fileName: string, note?: LessonNote) => {
    if (!url) return;
    // Open the PDF as an overlay on top of the sheet (DocReaderShell). This
    // keeps the underlying page (MyCourseDetail / LessonView) mounted so it
    // does NOT re-render / blink, and the Android back button pops the
    // reader's history sentinel → we return to the drawer at the exact same
    // scroll position instead of getting redirected to the chapter view.
    let resolved = url;
    if (!url.startsWith("http") && note) {
      const r = await getResolvedUrl(note);
      if (r) resolved = r;
    }
    setViewer({ url: resolved, title: fileName || lessonTitle || "Document", note });
  }, [getResolvedUrl, lessonTitle]);

  // Senior-architect rule: a drawer that has exactly one row is a
  // meaningless tap-through. When the lesson has a single downloadable /
  // viewable note, skip the sheet entirely and open the reader directly.
  // When there is 0 or >1 rows, keep the sheet (empty-state or picker).
  useEffect(() => {
    if (!open) { autoOpenedForRef.current = null; return; }
    if (loading) return;
    if (viewer) return;
    if (!lessonId) return;
    if (notes.length !== 1) return;
    if (autoOpenedForRef.current === lessonId) return;
    autoOpenedForRef.current = lessonId;
    const only = notes[0];
    void handleOpenPdf(only.file_url, only.file_name, only);
  }, [open, loading, viewer, notes, lessonId, handleOpenPdf]);


  const handleDownload = useCallback(async (note: LessonNote) => {
    const url = await getResolvedUrl(note);
    if (!url) { toast.error("Could not get file URL"); return; }
    // Google Drive: use pdf-proxy to stream raw PDF bytes and save through
    // the in-app download pipeline. Never redirect to Drive's HTML wrapper —
    // that triggers the "Select an account" flow and leaves the user
    // stranded in an external browser.
    let effectiveUrl = url;
    let filename = note.file_name || note.title || "document";
    if (isGoogleDrive(url)) {
      const proxied = googleDrivePdfProxyUrl(url);
      if (proxied) {
        effectiveUrl = proxied;
        if (!/\.[a-z0-9]{2,5}$/i.test(filename)) filename = `${filename}.pdf`;
        try {
          await addDownload(note.title || filename, effectiveUrl, filename, "PDF");
        } catch (err) {
          toast.error("Download failed: " + (err instanceof Error ? err.message : String(err)));
        }
        return;
      }
    }
    // Notion / Google Docs pages are HTML app surfaces, not downloadable
    // files — hand off to the host (there is no file to save).
    if (isNotion(url) || isGoogleDocs(url)) {
      await openResource({ url, kind: "link" });
      return;
    }
    // Ensure a sensible filename with the correct extension. If the stored
    // file_name has no extension (e.g. "view"), the browser falls back to
    // the response Content-Type and saves as .html — force `.pdf` for
    // PDF-kind notes so the file lands with the correct extension.
    const hasExt = /\.[a-z0-9]{2,5}$/i.test(filename);
    if (!hasExt && note.kind === "pdf") filename = `${filename}.pdf`;
    try {
      await addDownload(note.title || note.file_name, effectiveUrl, filename, note.kind.toUpperCase());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Download failed: " + msg);
    }
  }, [addDownload, getResolvedUrl]);

  return (
    <>
      {/*
        Blink fix: while `loading` is true we don't yet know if this lesson
        has 1 attachment (auto-open, no drawer) or 0/>1 (show drawer). If
        we render the Sheet open during loading, a single-PDF lesson shows
        the drawer for one frame before the auto-open effect swaps to the
        reader — that's the visible blink. Keep the Sheet closed until
        `loading` resolves, and skip mounting it entirely for the single-
        attachment case.
      */}
      <Sheet
        open={open && !viewer && !loading && notes.length !== 1}
        onOpenChange={onOpenChange}
        modal={false}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[80vh] overflow-y-auto p-0 data-[state=open]:duration-300 data-[state=closed]:duration-200 ease-out"
          onPointerDownOutside={() => onOpenChange(false)}
          onInteractOutside={() => onOpenChange(false)}
        >
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 text-left">
            <SheetTitle className="text-base font-semibold truncate">
              {lessonTitle || "Notes"}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">Notes &amp; downloadable files</p>
          </SheetHeader>

          <div className="px-3 py-3">
            {loading ? (
              <div className="space-y-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5"
                  >
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-9 w-9 rounded-md" />
                  </div>
                ))}
              </div>
            ) : notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground">No notes attached yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Notes &amp; files for this lesson will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {notes.map((note) => (
                  <div key={note.id} className="flex items-center gap-1">
                    <div className="flex-1 min-w-0">
                      <AttachmentRow
                        attachment={note as any}
                        onOpenPdf={(url, fileName) => void handleOpenPdf(url, fileName, note)}
                        resolveUrl={() => getResolvedUrl(note)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownload(note)}
                      aria-label={`Download ${note.file_name}`}
                      className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {viewer && (
        <DocReaderShell
          url={viewer.url}
          title={viewer.title}
          filename={viewer.note?.file_name}
          itemId={viewer.note?.id ? `att_${viewer.note.id}` : undefined}
          source="attachment"
          onBack={() => setViewer(null)}
          onDownloaded={() => viewer.note && handleDownload(viewer.note)}
        />
      )}
    </>
  );
}

export default LessonAttachmentsSheet;
