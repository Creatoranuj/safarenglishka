import { supabase } from "../integrations/supabase/client";

/**
 * The `content` bucket is a mixed bucket:
 *   - `hero-banners/*`, `thumbnails/*`, `chapter-icons/*`  → anon-readable
 *   - `lessons/*`, `materials/*`, `notes/*`, root quiz images → enrollment-gated
 *
 * Legacy rows in `lessons.class_pdf_url`, `materials.file_url`, `notes.pdf_url`,
 * `questions.image_url` may store either:
 *   - a permanent `/object/public/content/<path>` URL from when the bucket was
 *     fully public, or
 *   - a new `storage://content/<path>` URI (bucket-agnostic).
 *
 * `resolveContentUrl` turns either form into a browser-loadable URL. Public
 * thumbnail/banner/icon folders use permanent public CDN URLs so course cards
 * load fast without signing. Gated lesson/material files still use short-lived
 * signed URLs. External URLs (Notion, Drive, external CDNs, or objects in a
 * different bucket) are returned untouched.
 *
 * Observability: every failure is logged with `[resolveContentUrl]` prefix
 * AND best-effort mirrored to `security_events` so a missing storage policy
 * shows up in the admin dashboard within seconds. Failures are throttled to
 * one report per (path, code) per session to avoid log storms.
 */
const BUCKET = "content";
const SIGNED_TTL_SECONDS = 60 * 60; // 1h
const PUBLIC_FOLDERS = new Set(["hero-banners", "thumbnails", "chapter-icons"]);

export function extractContentPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const storageMatch = /^storage:\/\/content\/(.+)$/i.exec(url);
  if (storageMatch) return decodeURIComponent(storageMatch[1]);
  const httpMatch = /\/content\/([^?#]+)/i.exec(url);
  if (httpMatch && /supabase\.co\/storage\//i.test(url)) {
    return decodeURIComponent(httpMatch[1]);
  }
  return null;
}

function isPublicFolder(path: string): boolean {
  const top = path.split("/")[0];
  return PUBLIC_FOLDERS.has(top);
}

// Session-scoped dedupe so a broken policy on one row doesn't flood logs.
const reportedFailures = new Set<string>();

async function reportFailure(
  code: "invalid_path" | "sign_failed" | "empty_signed_url",
  path: string | null,
  detail?: string
) {
  const key = `${code}:${path ?? "null"}`;
  if (reportedFailures.has(key)) return;
  reportedFailures.add(key);

  // Client-side: structured warn so it appears in browser console + any
  // remote log aggregator (Sentry, LogRocket) that hooks console.
  console.warn("[resolveContentUrl] failure", { code, path, detail });

  // Server-side: best-effort insert into security_events. Auth is optional
  // — if it fails (anon user, RLS denies), we silently drop; the console
  // warn is still the primary signal.
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) return;
    await supabase.from("security_events").insert({
      event_type: "content_url_resolve_failed",
      payload: {
        code,
        path,
        detail: detail ?? null,
        location: typeof window !== "undefined" ? window.location.pathname : null,
      },
    } as never);
  } catch {
    /* non-fatal */
  }
}

export async function resolveContentUrl(
  url: string | null | undefined,
  ttlSeconds: number = SIGNED_TTL_SECONDS
): Promise<string | null> {
  if (!url) return null;
  const path = extractContentPath(url);
  if (!path) return url; // Not a `content` bucket URL — pass through.
  if (isPublicFolder(path)) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl || null;
  }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error) {
    void reportFailure("sign_failed", path, error.message);
    return null;
  }
  if (!data?.signedUrl) {
    void reportFailure("empty_signed_url", path);
    return null;
  }
  return data.signedUrl;
}

