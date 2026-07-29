/**
 * Source-aware PDF error copy.
 *
 * Rule (per user QA): the "Drive file is private" wording must ONLY appear for
 * Drive-backed sources. For CDN / Supabase / direct URLs we surface the exact
 * reason instead — HTTP status, the server's status text when it gave one, and
 * the host that rejected the request, so the uploader knows where to look.
 */

export function isDrivePdfSource(src: string | null | undefined): boolean {
  return /drive\.google\.com|docs\.google\.com|googleusercontent\.com|pdf-proxy\?kind=drive|[?&]kind=drive/i.test(
    src || ""
  );
}

export function pdfSourceHost(src: string | null | undefined): string | null {
  if (!src) return null;
  try {
    return new URL(src, typeof window !== "undefined" ? window.location.href : "https://x.invalid").hostname || null;
  } catch {
    return null;
  }
}

export const DRIVE_PRIVATE_MSG =
  "This Drive file is private — ask the uploader to enable link sharing.";

export interface PdfErrorLike {
  name?: string;
  message?: string;
  status?: number;
  statusText?: string;
}

export function friendlyPdfErrorMessage(err: unknown, src: string | null | undefined): string {
  const e = (err || {}) as PdfErrorLike;
  const msg = e.message || String(err || "");
  const status = e.status ?? Number(msg.match(/HTTP\s+(\d{3})/i)?.[1] || 0);
  const isDrive = isDrivePdfSource(src);

  if (status === 403 || status === 404) {
    if (isDrive) return DRIVE_PRIVATE_MSG;
    const host = pdfSourceHost(src);
    const where = host ? ` by ${host}` : "";
    const reason = e.statusText ? ` — server said "${e.statusText}"` : "";
    return status === 404
      ? `PDF not found (404)${where}${reason}. The file was moved or deleted at its link — ask the uploader to re-upload it.`
      : `PDF access denied (403)${where}${reason}. The link is private or expired — tap Retry, or ask the uploader for a fresh link.`;
  }

  if (status === 503 || status === 502 || status === 504) {
    return "PDF service is busy. Retry in a few seconds.";
  }

  if (/HTML page, not a PDF|Drive did not return a PDF|HTTP 415/i.test(msg)) {
    return isDrive
      ? DRIVE_PRIVATE_MSG
      : "The link returned a web page instead of a PDF file. Check the file URL.";
  }

  if (/exceeds response Body|Content-Length header of network response/i.test(msg)) {
    return "The file download was cut short. Tap Retry to fetch a fresh copy.";
  }

  return msg || "Failed to load PDF.";
}
