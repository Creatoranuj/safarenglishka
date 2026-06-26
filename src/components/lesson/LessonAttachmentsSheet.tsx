import { useCallback, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { useLessonNotes, type LessonNote } from "../../hooks/useLessonNotes";
import { AttachmentRow } from "./AttachmentRow";
import { FileText, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import DocReaderShell from "../library/DocReaderShell";
import { useDownloads } from "../../hooks/useDownloads";
import { openPdfHybrid } from "../../lib/openPdfHybrid";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string | number;
}

export function LessonAttachmentsSheet({ open, onOpenChange, lessonId, lessonTitle }: Props) {
  const { notes, loading, getResolvedUrl } = useLessonNotes(open ? lessonId : undefined);
  const { addDownload } = useDownloads();
  const [viewer, setViewer] = useState<{ url: string; title: string; note?: LessonNote } | null>(null);

  const handleOpenPdf = useCallback(async (url: string, fileName: string) => {
    if (!url) return;
    let resolved = url;
    const note = notes.find((n) => n.file_url === url);
    if (!url.startsWith("http") && note) {
      const r = await getResolvedUrl(note);
      if (r) resolved = r;
    }
    const opened = await openPdfHybrid({
      url: resolved,
      fileName: fileName || lessonTitle || "Document",
    });
    if (opened) return;
    setViewer({ url: resolved, title: fileName || lessonTitle || "Document", note });
  }, [notes, getResolvedUrl, lessonTitle]);


  const handleDownload = useCallback(async (note: LessonNote) => {
    const url = await getResolvedUrl(note);
    if (!url) { toast.error("Could not get file URL"); return; }
    try {
      await addDownload(note.title || note.file_name, url, note.file_name, note.kind.toUpperCase());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Download failed: " + msg);
    }
  }, [addDownload, getResolvedUrl]);

  return (
    <>
      <Sheet open={open && !viewer} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 text-left">
            <SheetTitle className="text-base font-semibold truncate">
              {lessonTitle || "Notes"}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">Notes &amp; downloadable files</p>
          </SheetHeader>

          <div className="px-3 py-3">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm">Loading notes…</span>
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
                        onOpenPdf={handleOpenPdf}
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
