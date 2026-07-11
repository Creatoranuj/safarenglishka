import { useState } from "react";
import { reportError } from "@/lib/sentry";
import { FileText, FileType2, Image as ImageIcon, Music, Video, File, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LessonAttachment, LessonAttachmentKind } from "@/hooks/useLessonAttachments";
import PdfIcon from "@/components/common/PdfIcon";

interface AttachmentRowProps {
  attachment: LessonAttachment;
  onOpenPdf: (url: string, fileName: string) => void;
  resolveUrl: () => Promise<string | null>;
  onDownloaded?: (title: string, url: string, filename: string, kind: string) => void;
  className?: string;
}

const ICONS: Record<LessonAttachmentKind, typeof FileText> = {
  pdf: FileText,
  doc: FileType2,
  image: ImageIcon,
  video: Video,
  audio: Music,
  other: File,
};

const ICON_TINT: Record<LessonAttachmentKind, string> = {
  pdf: "bg-destructive/10 text-destructive",
  doc: "bg-primary/10 text-primary",
  image: "bg-accent/30 text-accent-foreground",
  video: "bg-secondary/40 text-secondary-foreground",
  audio: "bg-secondary/40 text-secondary-foreground",
  other: "bg-muted text-muted-foreground",
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentRow({ attachment, onOpenPdf, resolveUrl, onDownloaded, className }: AttachmentRowProps) {
  const [busy, setBusy] = useState(false);
  const Icon = ICONS[attachment.kind] || File;
  const tint = ICON_TINT[attachment.kind] || ICON_TINT.other;
  const sizeStr = formatSize(attachment.file_size);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await resolveUrl();
      if (!url) return;
      if (attachment.kind === "pdf") {
        onOpenPdf(url, attachment.title || attachment.file_name);
      } else {
        await runDownload(url);
      }
    } finally {
      setBusy(false);
    }
  };

  const runDownload = async (url: string) => {
    const { savePdfToDevice } = await import("@/lib/nativePdfSaver");
    const t = toast.loading("Saving file…");
    try {
      const { nativeSave } = await savePdfToDevice(url, attachment.file_name);
      toast.success(
        nativeSave ? "Saved to Documents/SafarEnglish/" : "Download started",
        { id: t },
      );
      onDownloaded?.(attachment.title || attachment.file_name, url, attachment.file_name, attachment.kind.toUpperCase());
    } catch (err: any) {
      toast.error(err?.message || "Download failed", { id: t });
      reportError(err, { surface: "AttachmentRow.download" });
    }
  };




  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 py-2.5 w-full rounded-md px-2 transition-colors hover:bg-accent/10",
        className
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:opacity-60"
      >
        {attachment.kind === "pdf" && !busy ? (
          <PdfIcon className="h-7 w-7 flex-shrink-0 rounded-md" />
        ) : (
          <div className={cn("h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0", tint)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-foreground truncate">{attachment.title || attachment.file_name}</p>
          {sizeStr && <p className="text-xs text-muted-foreground">{sizeStr}</p>}
        </div>
      </button>

      {/* Big blue circular download FAB removed per UX request — the
          minimal outline download icon in LessonAttachmentsSheet is the
          single source of truth for downloads, so each attachment row now
          shows exactly one download affordance instead of two. */}
    </div>
  );
}
