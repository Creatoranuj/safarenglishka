// Detect material file type from a URL/filename.
// Used by Admin Library upload to auto-classify any pasted link.

export type MaterialFileType =
  | "PDF" | "DOC" | "DOCX" | "XLSX" | "PPT"
  | "NOTES" | "DPP" | "IMAGE" | "VIDEO" | "MD" | "LINK";

export function detectFileType(url: string): MaterialFileType {
  const u = url.trim().toLowerCase();
  if (!u) return "LINK";

  // Extension match (most reliable)
  const extMatch = u.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/);
  const ext = extMatch?.[1];
  if (ext) {
    if (ext === "pdf") return "PDF";
    if (ext === "doc") return "DOC";
    if (ext === "docx") return "DOCX";
    if (["xls", "xlsx", "csv"].includes(ext)) return "XLSX";
    if (["ppt", "pptx"].includes(ext)) return "PPT";
    if (["md", "markdown"].includes(ext)) return "MD";
    if (["jpg", "jpeg", "png", "webp", "gif", "svg", "heic"].includes(ext)) return "IMAGE";
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "VIDEO";
  }

  // Domain hints (Google Drive / Docs / etc. usually have no extension)
  if (u.includes("docs.google.com/spreadsheets")) return "XLSX";
  if (u.includes("docs.google.com/presentation")) return "PPT";
  if (u.includes("docs.google.com/document")) return "DOCX";
  if (u.includes("youtube.com") || u.includes("youtu.be") || u.includes("vimeo.com")) return "VIDEO";
  if (u.includes("drive.google.com")) return "PDF"; // best guess for Drive shares

  return "LINK";
}

export const fileTypeOptions: { value: MaterialFileType; label: string; icon: string }[] = [
  { value: "PDF",   label: "PDF",          icon: "📄" },
  { value: "DOC",   label: "Doc (.doc)",   icon: "📝" },
  { value: "DOCX",  label: "Word (.docx)", icon: "📝" },
  { value: "XLSX",  label: "Spreadsheet",  icon: "📊" },
  { value: "PPT",   label: "Presentation", icon: "📽️" },
  { value: "NOTES", label: "Notes",        icon: "🗒️" },
  { value: "DPP",   label: "DPP",          icon: "📋" },
  { value: "IMAGE", label: "Image",        icon: "🖼️" },
  { value: "VIDEO", label: "Video",        icon: "🎬" },
  { value: "LINK",  label: "Other Link",   icon: "🔗" },
];
