import { useEffect, useRef, useState } from "react";
import { addBreadcrumb, captureException } from "../lib/sentry";
import { isResolvableStorageViewerUrl, resolveStorageBytes } from "../lib/naveenStoragePdf";
import { fileDB as personalFileDB } from "../lib/personalLibraryDB";
import { downloadFileDB, getDownload } from "../lib/indexedDB";

/**
 * Normalises any PDF URL into something react-pdf / pdf.js can load reliably.
 *
 * - Remote http(s) URLs are passed through untouched (pdf.js streams them with
 *   range requests — see FastPdfReader).
 * - Local URLs (capacitor://, file://, ionic://, http://localhost/_capacitor_file_…)
 *   cannot be range-requested by the pdf.js worker, so we read the bytes once and
 *   expose a same-origin `blob:` URL instead. This is what makes autoscroll +
 *   canvas rendering work for offline Library / Downloads / Attachment PDFs.
 *
 * Returns the resolved source URL plus loading/error state.
 */
export type LocalPdfState = {
  src: string | null;
  data: Uint8Array | null;
  loading: boolean;
  error: string | null;
  /** true when the source had to be materialised into a blob (local file). */
  isLocal: boolean;
};

const LOCAL_RE = /^(capacitor:|ionic:|file:|blob:|data:|web-indexeddb:|nb-personal-library:)/i;
const isLocalHttp = (u: string) =>
  /^https?:\/\/localhost\//i.test(u) || /_capacitor_file_/i.test(u);

const webDownloadId = (u: string) => u.match(/^web-indexeddb:(\d+)$/i)?.[1] ?? null;
const personalLibraryId = (u: string) => u.match(/^nb-personal-library:([^?#]+)$/i)?.[1] ?? null;
const FETCH_TIMEOUT_MS = 18000;

async function fetchBlobWithTimeout(url: string, signal: AbortSignal): Promise<Blob> {
  // First attempt — normal cached fetch.
  let res = await fetch(url, { credentials: "omit", signal });
  // Signed-URL expiry / transient gateway hiccup: one retry with cache bypass.
  // 401/403/410 = expired signature; 408/425/429/5xx = transient. Skip 404
  // (real missing object — retry won't help and just delays the error toast).
  if (!res.ok && res.status !== 404 && /^(?:401|403|408|410|425|429|5\d\d)$/.test(String(res.status))) {
    addBreadcrumb("pdf", "fetch:retry", { status: res.status, url: url.slice(0, 80) });
    const sep = url.includes("?") ? "&" : "?";
    res = await fetch(`${url}${sep}_nbretry=${Date.now()}`, { credentials: "omit", signal, cache: "reload" });
  }
  if (!res.ok) throw new Error(`FileNotFound: HTTP ${res.status}`);
  return res.blob();
}

/**
 * Read a Capacitor-local file (capacitor://, file://, or the WebViewLocalServer
 * https://localhost/_capacitor_file_/<path> form) DIRECTLY via the Filesystem
 * plugin instead of round-tripping through fetch(). This avoids a class of
 * release-APK bugs where WebViewLocalServer returns empty/HTML responses for
 * large binary files, making offline PDFs fail to open.
 *
 * Returns null on web (or when the plugin isn't available) so the caller can
 * fall back to the normal fetch path.
 */
async function readNativeFileAsBlob(url: string): Promise<Blob | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { Filesystem } = await import("@capacitor/filesystem");

    // Extract an absolute file path from any of the supported local URL forms.
    let absPath: string | null = null;
    if (/^file:\/\//i.test(url)) {
      absPath = decodeURIComponent(url.replace(/^file:\/\//i, ""));
    } else if (/_capacitor_file_/i.test(url)) {
      const m = url.match(/_capacitor_file_(.*)$/i);
      if (m) absPath = decodeURIComponent(m[1]);
    } else if (/^capacitor:\/\//i.test(url) || /^ionic:\/\//i.test(url)) {
      // capacitor://localhost/_capacitor_file_/<abs>
      const m = url.match(/_capacitor_file_(.*)$/i);
      if (m) absPath = decodeURIComponent(m[1]);
    }
    if (!absPath) return null;

    // Filesystem.readFile with an absolute path requires NO `directory` option.
    const res = await Filesystem.readFile({ path: absPath });
    const data = res.data;
    if (typeof data === "string") {
      // base64 → bytes → blob
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: "application/pdf" });
    }
    // Some Capacitor versions return a Blob directly.
    if (data instanceof Blob) return data;
    return null;
  } catch (err) {
    addBreadcrumb("pdf", "readNativeFile:fail", { msg: (err as Error)?.message });
    return null;
  }
}

export function isLocalPdfUrl(url: string): boolean {
  return LOCAL_RE.test(url) || isLocalHttp(url);
}

export function useLocalPdfSource(url: string): LocalPdfState {
  const initiallyMaterialized = isLocalPdfUrl(url) || isResolvableStorageViewerUrl(url);
  const [state, setState] = useState<LocalPdfState>({
    src: initiallyMaterialized ? null : url,
    data: null,
    loading: initiallyMaterialized,
    error: null,
    isLocal: initiallyMaterialized,
  });
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    // Clean up any blob URL from a previous source.
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!url) {
      setState({ src: null, data: null, loading: false, error: "No file", isLocal: false });
      return;
    }

    const isLocal = isLocalPdfUrl(url);
    const isResolvableRemote = !isLocal && isResolvableStorageViewerUrl(url);
    const shouldMaterialize = isLocal || isResolvableRemote;

    if (!shouldMaterialize) {
      setState({ src: url, data: null, loading: false, error: null, isLocal: false });
      return;
    }

    // blob:/data: URLs from the personal library are same-origin object URLs.
    // Materialise them to bytes before handing them to pdf.js; mobile Firefox /
    // Android WebView can fail when the worker tries to re-fetch blob URLs by
    // URL, which surfaces as "Could not load this PDF" even though the Blob is valid.

    setState({ src: null, data: null, loading: true, error: null, isLocal: true });
    addBreadcrumb("pdf", "materialize-local", { url: url.slice(0, 80) });

    (async () => {
      try {
        const dlId = webDownloadId(url);
        const plId = personalLibraryId(url);
        let blob: Blob | undefined;
        if (dlId) {
          blob = (await downloadFileDB.get(Number(dlId)))?.blob;
          if (!blob) {
            // Bytes missing locally — only attempt remote fetch when online.
            if (typeof navigator !== "undefined" && navigator.onLine === false) {
              throw new Error("This file isn't available offline. Re-download it while you're online.");
            }
            const rec = await getDownload(Number(dlId));
            if (rec?.url) {
              blob = await fetchBlobWithTimeout(rec.url, controller.signal);
            }
          }
        } else if (plId) {
          blob = (await personalFileDB.get(plId))?.blob;
          if (!blob) {
            throw new Error("This library file is no longer available on this device.");
          }
        } else if (isResolvableRemote) {
          blob = await resolveStorageBytes(url, controller.signal);
        } else {
          // For native local URLs, prefer reading bytes directly via the
          // Filesystem plugin (skips the WebViewLocalServer round-trip that
          // breaks in release APKs for large binary PDFs).
          if (isLocal) {
            const direct = await readNativeFileAsBlob(url);
            if (direct) blob = direct;
          }
          if (!blob) {
            blob = await fetchBlobWithTimeout(url, controller.signal);
          }
        }
        if (!blob) throw new Error("FileNotFound: local PDF bytes missing");
        if (dlId) {
          try { await downloadFileDB.put(Number(dlId), blob); } catch { /* best-effort repair */ }
        }
        if (!alive) return;
        const data = new Uint8Array(await blob.arrayBuffer());
        setState({ src: null, data, loading: false, error: null, isLocal: true });
        addBreadcrumb("pdf", "materialize-local:ok", { size: blob.size });
      } catch (err) {
        if (!alive) return;
        captureException(err, { where: "useLocalPdfSource", url: url.slice(0, 120) });
        const isIndexedLocal = !!webDownloadId(url) || !!personalLibraryId(url);
        const rawMsg = (err as Error)?.message || "";
        const isNetworkErr = /NetworkError|Failed to fetch|network/i.test(rawMsg);
        // Soft fallback for resolvable remote/local browser URLs: pass through
        // the original URL so pdf.js can attempt a direct stream. IndexedDB
        // virtual URLs are not real fetchable URLs, so surface a clean error.
        if ((isResolvableRemote || isLocal) && !isIndexedLocal) {
          setState({ src: url, data: null, loading: false, error: null, isLocal: false });
        } else {
          const friendly = isIndexedLocal && isNetworkErr
            ? "This file isn't available offline. Re-download it while you're online."
            : rawMsg || "FileNotFound";
          setState({
            src: null,
            data: null,
            loading: false,
            error: friendly,
            isLocal: true,
          });
        }
      }
    })();

    return () => {
      alive = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [url]);

  // Revoke on unmount.
  useEffect(
    () => () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    },
    []
  );

  return state;
}
