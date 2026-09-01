/**
 * Google Drive files can be shared publicly and still refuse every download
 * endpoint when the owner ticked "Viewers and commenters cannot download,
 * print, copy". `pdf-proxy` detects that interstitial and answers with
 * `{ type: "drive_download_disabled", viewUrl }` (HTTP 403).
 *
 * pdf.js only surfaces the status code, so the reader used to show the
 * generic "This Drive file is private" copy. This helper re-asks the proxy
 * for the JSON body so the UI can state the real reason and offer
 * "Open in Drive" instead of a Retry that can never succeed.
 *
 * Security: only ever called with the app's own proxy/Drive URLs, and it
 * never echoes the URL or any token back to the UI.
 */

export const DRIVE_DOWNLOAD_DISABLED_MSG =
  "Is Drive file ka download owner ne band kar rakha hai — ise sirf Drive par khola ja sakta hai. Neeche \"Open in Drive\" tap karein.";

export interface DriveBlockInfo {
  message: string;
  viewUrl: string;
}

function driveIdFrom(src: string): string | null {
  const m =
    src.match(/[?&]id=([A-Za-z0-9_-]{10,})/) ||
    src.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) ||
    src.match(/[?&]kind=drive[^#]*?[?&]id=([A-Za-z0-9_-]{10,})/);
  return m?.[1] || null;
}

/**
 * Once a file is known to be download-disabled the verdict is permanent for
 * this session. Re-opening the same lesson used to re-probe the proxy, and a
 * flaky/aborted second probe returned `null` → the student got the generic
 * "Could not load PDF." card instead of the read-only Drive preview.
 */
const blockedIds = new Set<string>();

function infoFor(id: string, viewUrl?: string): DriveBlockInfo {
  return {
    message: DRIVE_DOWNLOAD_DISABLED_MSG,
    viewUrl: viewUrl || (id ? `https://drive.google.com/file/d/${id}/view` : "https://drive.google.com"),
  };
}

/** True when the URL is Drive-backed (direct link or our pdf-proxy). */
export function isDriveBackedSource(src: string | null | undefined): boolean {
  return (
    !!src &&
    /^https?:/i.test(src) &&
    /drive\.google\.com|googleusercontent\.com|[?&]kind=drive/i.test(src)
  );
}

/**
 * Read-only Drive preview derived straight from any Drive-backed source, so a
 * failed/aborted probe can still fall back to something readable.
 */
export function drivePreviewFromSource(src: string | null | undefined): string | null {
  if (!isDriveBackedSource(src)) return null;
  const id = driveIdFrom(src as string);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

/**
 * Returns download-disabled details when the source is a Drive-backed URL the
 * proxy rejected for that reason; `null` in every other case.
 */
export async function probeDriveBlock(
  src: string | null | undefined,
  signal?: AbortSignal,
): Promise<DriveBlockInfo | null> {
  if (!isDriveBackedSource(src)) return null;
  const knownId = driveIdFrom(src as string);
  if (knownId && blockedIds.has(knownId)) return infoFor(knownId);

  try {
    const res = await fetch(src as string, { credentials: "omit", cache: "no-store", signal });
    const code = res.headers.get("x-pdf-error-code") || "";
    // The proxy now answers download-disabled with HTTP 200 + typed JSON (a
    // 403 was logged as an edge-function runtime error on every open), so the
    // verdict must be read from the header/body, not from `res.ok`.
    if (res.ok && !code && !/application\/json/i.test(res.headers.get("content-type") || "")) return null;
    const body = (await res.json().catch(() => null)) as
      | { type?: string; viewUrl?: string }
      | null;
    const type = body?.type || code;
    if (type !== "drive_download_disabled") return null;
    if (knownId) blockedIds.add(knownId);
    return infoFor(knownId || "", body?.viewUrl);
  } catch {
    return null;
  }
}


/**
 * Drive's `/preview` embed renders view-only files (no X-Frame-Options), so a
 * download-disabled file can still be READ inside the app.
 */
export function drivePreviewFromViewUrl(viewUrl: string): string | null {
  const id = driveIdFrom(viewUrl);
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}
