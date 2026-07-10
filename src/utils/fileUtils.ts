/**
 * File download utilities — handles Drive, Docs, Archive.org & direct PDF URLs
 * Supports Capacitor native downloads for APK builds
 */
import { isResolvableStorageViewerUrl, resolveStorageBytes } from "@/lib/native/naveenStoragePdf";

/** Extract Google Drive file ID from various URL formats */
export const extractDriveFileId = (url: string): string | null => {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
};

/** Extract Google Docs document ID */
export const extractDocsId = (url: string): string | null => {
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
};

/** Extract Archive.org item identifier */
export const extractArchiveId = (url: string): string | null => {
  const match = url.match(/archive\.org\/(?:details|embed|download)\/([^/?#]+)/);
  return match?.[1] || null;
};

/**
 * Async: fetch Archive.org metadata API to find the best direct PDF download URL.
 * Falls back to the {id}.pdf pattern, then the download listing page.
 */
export const getArchiveDownloadUrl = async (identifier: string): Promise<string> => {
  try {
    const res = await fetch(`https://archive.org/metadata/${identifier}`, { mode: "cors" });
    if (res.ok) {
      const meta = await res.json();
      const files: Array<{ name: string; format: string }> = meta?.files ?? [];
      const pdf = files.find(
        (f) =>
          /text pdf/i.test(f.format) ||
          (/pdf/i.test(f.format) && f.name.toLowerCase().endsWith(".pdf"))
      ) || files.find((f) => f.name.toLowerCase().endsWith(".pdf"));
      if (pdf) {
        return `https://archive.org/download/${identifier}/${encodeURIComponent(pdf.name)}`;
      }
    }
  } catch {
    // metadata fetch failed — fall through
  }
  return `https://archive.org/download/${identifier}/${identifier}.pdf`;
};

/** Get a direct download URL for various sources (synchronous fallback) */
export const getDownloadUrl = (url: string): string => {
  const driveId = extractDriveFileId(url);
  if (driveId && /drive\.google\.com/.test(url)) {
    return `https://drive.google.com/uc?export=download&id=${driveId}`;
  }

  const docsId = extractDocsId(url);
  if (docsId) {
    return `https://docs.google.com/document/d/${docsId}/export?format=pdf`;
  }

  const archiveId = extractArchiveId(url);
  if (archiveId) {
    return `https://archive.org/download/${archiveId}/${archiveId}.pdf`;
  }

  return url;
};

/** Extract a reasonable filename from a URL */
const extractFilename = (url: string, fallback = "document.pdf"): string => {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && /\.\w+$/.test(last)) return decodeURIComponent(last);
  } catch {
    // ignore
  }
  return fallback;
};

/** Check if running inside Capacitor native shell */
const isNativePlatform = (): boolean => {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

const safeName = (name: string) => (name || "document.pdf").replace(/[\/\\?%*:|"<>]/g, "_").trim();

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Convert one small blob slice to base64. Never encode a whole PDF at once. */
const blobSliceToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || result);
    };
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(blob);
  });

const bridgeWrite = <T,>(p: Promise<T>, tag: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${tag} timed out`)), 30_000);
    p.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });

const writeBlobChunked = async (
  Filesystem: typeof import("@capacitor/filesystem").Filesystem,
  Directory: typeof import("@capacitor/filesystem").Directory,
  blob: Blob,
  path: string,
) => {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const chunkSize = memory <= 2 ? 128 * 1024 : memory <= 4 ? 512 * 1024 : 1024 * 1024;
  let first = true;
  let index = 0;
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const data = await blobSliceToBase64(blob.slice(offset, Math.min(offset + chunkSize, blob.size)));
    if (first) {
      await bridgeWrite(Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true }), "Filesystem.writeFile");
      first = false;
    } else {
      await bridgeWrite(Filesystem.appendFile({ path, data, directory: Directory.Documents }), "Filesystem.appendFile");
    }
    index += 1;
    if (index % 8 === 0) await yieldToUi();
  }
};

/** Bytes look like a PDF header (%PDF-)? */
const looksLikePdfBytes = (bytes: Uint8Array): boolean =>
  bytes.length >= 5 &&
  bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;

/**
 * Download a file. On Capacitor native, saves to device Downloads folder.
 * On web, tries blob fetch first; falls back to opening the download URL in a new tab.
 *
 * Throws with a human-readable message on hard failure so the caller can toast.
 */
export const downloadFile = async (url: string, filename?: string): Promise<void> => {
  const downloadUrl = getDownloadUrl(url);
  const name = safeName(filename || extractFilename(downloadUrl));
  const expectsPdf = /\.pdf($|\?)/i.test(downloadUrl) || /\.pdf$/i.test(name);

  const fetchBlob = async () => {
    if (isResolvableStorageViewerUrl(downloadUrl)) return resolveStorageBytes(downloadUrl);
    const res = await fetch(downloadUrl, { mode: "cors" });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    const ct = res.headers.get("content-type") || "";
    // Guard: many CDNs/viewers return HTML for expired/private links. Treat as failure
    // instead of saving an HTML page as ".pdf".
    if (expectsPdf && /text\/html/i.test(ct)) {
      throw new Error("This link is a viewer page, not a downloadable PDF.");
    }
    return res.blob();
  };

  // ── Capacitor native download ──
  if (isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const path = `downloads/${name}`;
    const canNativeStream = !isResolvableStorageViewerUrl(downloadUrl) && /^https?:\/\//i.test(downloadUrl);
    let lastErr: unknown = null;

    if (canNativeStream && "downloadFile" in Filesystem) {
      try {
        await (Filesystem as typeof Filesystem & {
          downloadFile: (opts: { url: string; path: string; directory: unknown; recursive?: boolean }) => Promise<unknown>;
        }).downloadFile({ url: downloadUrl, path, directory: Directory.Documents, recursive: true });

        // Verify what we saved is actually a PDF (upstream may have returned HTML).
        if (expectsPdf) {
          try {
            const head = await Filesystem.readFile({ path, directory: Directory.Documents });
            const b64 = typeof head.data === "string" ? head.data.slice(0, 12) : "";
            // Decode first 6 bytes only — enough for %PDF- magic.
            const bin = atob(b64.replace(/\s+/g, ""));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            if (!looksLikePdfBytes(bytes)) {
              await Filesystem.deleteFile({ path, directory: Directory.Documents }).catch(() => {});
              throw new Error("Downloaded file is not a valid PDF.");
            }
          } catch (verifyErr) {
            // If verification threw a real error (not a decode oddity), propagate it.
            if (verifyErr instanceof Error && /not a valid PDF/i.test(verifyErr.message)) throw verifyErr;
            // Otherwise trust the native download.
          }
        }
        return;
      } catch (nativeErr) {
        console.warn("[downloadFile] Native stream failed, retrying via blob:", nativeErr);
        lastErr = nativeErr;
      }
    }

    // Fallback: authenticated blob → chunked write.
    try {
      const blob = await fetchBlob();
      await writeBlobChunked(Filesystem, Directory, blob, path);
      return;
    } catch (blobErr) {
      console.error("[downloadFile] Native blob fallback failed:", blobErr);
      // On native there is no "open in new tab" — surface a real error.
      throw blobErr instanceof Error ? blobErr : new Error(String(blobErr || lastErr || "Download failed"));
    }
  }

  // ── Web download ──
  try {
    const blob = await fetchBlob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 200);
    return;
  } catch (webErr) {
    console.warn("[downloadFile] Blob fetch failed, opening URL directly:", webErr);
  }

  // Last-resort fallback: open the URL in a new tab (web only).
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = name;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 200);
};
