import { useEffect, useState } from "react";
import { getDownloads } from "../lib/indexedDB";
import { resolveDownloadUri } from "../services/savedDownloads";

/**
 * Given a remote (course/lesson) file URL, prefer a locally-saved copy from
 * the Downloads index when available. Falls back to the original URL when
 * nothing has been downloaded, or when resolving the local copy fails.
 *
 * This lets every PdfViewer site (lesson view, attachments, DPP, etc.) open
 * offline without each call-site having to wire the downloads service.
 */
export function useOfflineResolvedUrl(url: string): { url: string; ready: boolean } {
  const [resolved, setResolved] = useState<string>(url);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setResolved(url);
    if (!url || /^(capacitor:|ionic:|file:|blob:|data:|web-indexeddb:|nb-personal-library:)/i.test(url)) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const all = await getDownloads();
        const match = all.find((r) => r.url === url && !!r.local_path);
        if (!match) {
          if (alive) setReady(true);
          return;
        }
        const local = await resolveDownloadUri(match);
        if (alive) {
          setResolved(local);
          setReady(true);
        }
      } catch {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  return { url: resolved, ready };
}
