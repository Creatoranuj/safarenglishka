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

/**
 * Download a file. On Capacitor native, saves to device Downloads folder.
 * On web, tries blob fetch first; falls back to opening the download URL in a new tab.
 */
export const downloadFile = async (url: string, filename?: string): Promise<void> => {
  const downloadUrl = getDownloadUrl(url);
  const name = safeName(filename || extractFilename(downloadUrl));
  const fetchBlob = async () => {
    if (isResolvableStorageViewerUrl(downloadUrl)) return resolveStorageBytes(downloadUrl);
    const res = await fetch(downloadUrl, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  };

  // ── Capacitor native download ──
  if (isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const path = `downloads/${name}`;
      const canNativeStream = !isResolvableStorageViewerUrl(downloadUrl) && /^https?:\/\//i.test(downloadUrl);
      if (canNativeStream && "downloadFile" in Filesystem) {
        await (Filesystem as typeof Filesystem & {
          downloadFile: (opts: { url: string; path: string; directory: unknown; recursive?: boolean }) => Promise<unknown>;
        }).downloadFile({ url: downloadUrl, path, directory: Directory.Documents, recursive: true });
      } else {
        const blob = await fetchBlob();
        await writeBlobChunked(Filesystem, Directory, blob, path);
      }
      return;
    } catch (nativeErr) {
      console.warn("[downloadFile] Native download failed, trying fallback:", nativeErr);
      // fall through to web approach
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
  } catch {
    // CORS blocked — fall through
  }

  // Fallback: open the download URL directly
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = name;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 200);
};
