/**
 * Pure resolver for `?openPdf=...` deep-links on a lesson page.
 *
 * - `openPdf=1` (or any truthy value that isn't an id we know) → pick the first
 *   available PDF in priority order: class_pdf_url → lessonPdfs[0] →
 *   first PDF attachment.
 * - `openPdf=<id>` → find the matching PDF by id across the same sources.
 *   Special id `class-pdf` resolves to `class_pdf_url`.
 *
 * Returned shapes are intentionally minimal so this stays trivially
 * unit-testable without React / Supabase. The caller resolves signed URLs
 * for attachments (returned as `kind: "attachment"`).
 */

export type DeepLinkPdf =
  | { kind: "direct"; pdf: { id: string; file_name: string; file_url: string } }
  | {
      kind: "attachment";
      attachment: { id: string; file_name: string; title?: string | null };
    }
  | null;

interface LessonLike {
  id: string;
  title: string;
  class_pdf_url?: string | null;
}

interface LessonPdfLike {
  id: string;
  file_name: string;
  file_url: string;
}

interface AttachmentLike {
  id: string;
  file_name?: string | null;
  title?: string | null;
  mime_type?: string | null;
}

const isPdfAttachment = (a: AttachmentLike): boolean => {
  const name = (a.file_name || a.title || "").toLowerCase();
  const mime = (a.mime_type || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
};

// Gated trace — only logs when the same flag the LessonView overlay uses is
// set, so production users see nothing. Tracing inside the resolver tells
// you WHY a row was chosen (id-match vs class-pdf-fallback vs first-available).
const trace = (reason: string, extra: Record<string, unknown> = {}): void => {
  try {
    if (typeof window === "undefined") return;
    const on =
      new URLSearchParams(window.location.search).has("debug") ||
      window.localStorage?.getItem("nb_pdf_debug") === "1";
    if (!on) return;
    // eslint-disable-next-line no-console
    console.log("[pdf-debug] resolved", { reason, ...extra });
  } catch { /* noop */ }
};

export function resolveDeepLinkPdf(
  openPdfParam: string | null,
  lesson: LessonLike,
  lessonPdfs: LessonPdfLike[],
  attachments: AttachmentLike[],
): DeepLinkPdf {
  if (!openPdfParam) return null;

  const wantsFirst = openPdfParam === "1" || openPdfParam === "true";

  // Targeted id lookup
  if (!wantsFirst) {
    if (openPdfParam === "class-pdf" && lesson.class_pdf_url) {
      trace("id-match:class-pdf", { param: openPdfParam });
      return {
        kind: "direct",
        pdf: {
          id: "class-pdf",
          file_name: `${lesson.title} : Class Notes`,
          file_url: lesson.class_pdf_url,
        },
      };
    }
    const pdfMatch = lessonPdfs.find((p) => p.id === openPdfParam);
    if (pdfMatch) {
      trace("id-match:lesson_pdfs", { param: openPdfParam, id: pdfMatch.id });
      return {
        kind: "direct",
        pdf: {
          id: pdfMatch.id,
          file_name: pdfMatch.file_name,
          file_url: pdfMatch.file_url,
        },
      };
    }
    const attMatch = attachments.find(
      (a) => a.id === openPdfParam && isPdfAttachment(a),
    );
    if (attMatch) {
      trace("id-match:attachment", { param: openPdfParam, id: attMatch.id });
      return {
        kind: "attachment",
        attachment: {
          id: attMatch.id,
          file_name: attMatch.file_name || attMatch.title || "attachment.pdf",
          title: attMatch.title,
        },
      };
    }
    trace("id-miss:fallback-to-first", {
      param: openPdfParam,
      lessonPdfs: lessonPdfs.length,
      attachments: attachments.length,
    });
    // Unknown id — fall through to first-available so the deep link still
    // opens something rather than landing on an empty list.
  }

  if (lesson.class_pdf_url) {
    trace("first-available:class_pdf_url");
    return {
      kind: "direct",
      pdf: {
        id: "class-pdf",
        file_name: `${lesson.title} : Class Notes`,
        file_url: lesson.class_pdf_url,
      },
    };
  }
  if (lessonPdfs.length > 0) {
    const p = lessonPdfs[0];
    trace("first-available:lesson_pdfs[0]", { id: p.id });
    return {
      kind: "direct",
      pdf: { id: p.id, file_name: p.file_name, file_url: p.file_url },
    };
  }
  const firstPdfAtt = attachments.find(isPdfAttachment);
  if (firstPdfAtt) {
    trace("first-available:attachment", { id: firstPdfAtt.id });
    return {
      kind: "attachment",
      attachment: {
        id: firstPdfAtt.id,
        file_name:
          firstPdfAtt.file_name || firstPdfAtt.title || "attachment.pdf",
        title: firstPdfAtt.title,
      },
    };
  }
  trace("no-match", { param: openPdfParam });
  return null;
}
