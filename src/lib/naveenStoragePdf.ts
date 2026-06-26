const STORAGE_HOST_RE = /storage-naveenbharat-recording\.vercel\.app/i;
const VIEW_ID_RE = /\/view\/([a-f0-9-]{20,})/i;

const TELEGRAM_SUPABASE_URL = "https://hsvtagmckkfmniawflul.supabase.co";
const TELEGRAM_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzdnRhZ21ja2tmbW5pYXdmbHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzQ1NzUsImV4cCI6MjA4OTE1MDU3NX0.bumoGstxK-c1xeh4U91AS1xzF2XY6w8r9j2MS13Wy6g";

export function isNaveenStorageViewUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return STORAGE_HOST_RE.test(u.hostname) && VIEW_ID_RE.test(u.pathname);
  } catch {
    return false;
  }
}

export function getNaveenStorageViewId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!STORAGE_HOST_RE.test(u.hostname)) return null;
    return u.pathname.match(VIEW_ID_RE)?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function fetchNaveenStoragePdf(url: string, signal?: AbortSignal): Promise<Blob> {
  const id = getNaveenStorageViewId(url);
  if (!id) throw new Error("Unsupported Safar English Ka storage link");

  const rowUrl = `${TELEGRAM_SUPABASE_URL}/rest/v1/pdf_documents?select=file_id,file_name&id=eq.${encodeURIComponent(id)}`;
  const rowResp = await fetch(rowUrl, {
    signal,
    headers: {
      apikey: TELEGRAM_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${TELEGRAM_SUPABASE_ANON_KEY}`,
    },
  });
  if (!rowResp.ok) throw new Error(`Storage metadata HTTP ${rowResp.status}`);
  const rows = (await rowResp.json()) as Array<{ file_id?: string }>;
  const fileId = rows[0]?.file_id;
  if (!fileId) throw new Error("Storage file not found");

  const fileResp = await fetch(`${TELEGRAM_SUPABASE_URL}/functions/v1/telegram-get-file`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      apikey: TELEGRAM_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${TELEGRAM_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!fileResp.ok) throw new Error(`Storage file HTTP ${fileResp.status}`);
  return fileResp.blob();
}

/**
 * True for any URL we know how to convert into raw PDF bytes.
 * Currently: Naveen-Bharat storage `/view/<id>` viewer pages.
 * (Generic remote PDFs are left alone so pdf.js can stream them with range
 * requests — pre-materializing them would break streaming.)
 */
export function isResolvableStorageViewerUrl(url: string): boolean {
  return isNaveenStorageViewUrl(url);
}

/** Resolve a known viewer URL into a PDF Blob. */
export async function resolveStorageBytes(url: string, signal?: AbortSignal): Promise<Blob> {
  if (isNaveenStorageViewUrl(url)) return fetchNaveenStoragePdf(url, signal);
  // Fallback: fetch directly; if we got HTML back, treat as failure.
  const resp = await fetch(url, { signal, credentials: "omit" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const ct = resp.headers.get("content-type") || "";
  if (/text\/html/i.test(ct)) throw new Error("Source is an HTML viewer, not a PDF");
  return resp.blob();
}