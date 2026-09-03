// Cloudflare R2 (S3-compatible) client for the pdf-proxy cache tier.
// R2 free tier: 10 GB storage, ZERO egress fees — this is what removes the
// Google Drive per-file daily quota risk and the Supabase egress meter for
// repeat PDF opens.
//
// Env (all optional — when any is missing the proxy silently falls back to
// the Supabase pdf-cache bucket):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//   R2_BUCKET (default "safar-pdfs"), R2_PUBLIC_URL (e.g. https://cdn.example.com)
//
// SECURITY: objects are world-readable once uploaded (public bucket). Keys
// carry a random per-file salt segment uploaded only through this module, so
// URLs are unguessable. Direct-link sharing is an accepted risk — the same
// model the app already uses for jsDelivr-hosted PDFs. Never upload
// per-user sensitive documents here; this tier is for course PDFs only.

import { AwsClient } from "npm:aws4fetch@1.0.20";

export interface R2Config {
  client: AwsClient;
  bucket: string;
  endpoint: string;
  publicUrl: string; // no trailing slash
}

let cached: R2Config | null | undefined;

export function getR2(): R2Config | null {
  if (cached !== undefined) return cached;
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const publicUrl = (Deno.env.get("R2_PUBLIC_URL") || "").replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !publicUrl) {
    cached = null;
    return null;
  }
  cached = {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    bucket: Deno.env.get("R2_BUCKET") || "safar-pdfs",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    publicUrl,
  };
  return cached;
}

/** HEAD an object; returns true when it exists. */
export async function r2Has(cfg: R2Config, key: string): Promise<boolean> {
  try {
    const res = await cfg.client.fetch(`${cfg.endpoint}/${cfg.bucket}/${key}`, { method: "HEAD" });
    await res.body?.cancel().catch(() => {});
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Upload a buffered body. Sets a 1-year immutable Cache-Control on the object. */
export async function r2Put(cfg: R2Config, key: string, body: Blob, contentType: string): Promise<boolean> {
  try {
    const res = await cfg.client.fetch(`${cfg.endpoint}/${cfg.bucket}/${key}`, {
      method: "PUT",
      body,
      headers: {
        "Content-Type": contentType || "application/pdf",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    await res.body?.cancel().catch(() => {});
    return res.ok;
  } catch (err) {
    console.warn("[r2] put failed", key, (err as Error).message);
    return false;
  }
}

/** Public URL for a key. */
export function r2Url(cfg: R2Config, key: string): string {
  return `${cfg.publicUrl}/${key}`;
}

/**
 * Key for a Drive-cached PDF. The drive id is already a high-entropy random
 * string (25+ chars), so `drive/<id>.pdf` is unguessable in practice — same
 * obscurity level as the signed Supabase cache URLs, minus expiry.
 */
export function driveKey(driveId: string): string {
  return `drive/${driveId}.pdf`;
}

/**
 * Random key for a fresh admin upload. 16 random bytes → 32 hex chars makes
 * enumeration infeasible; path segment "uploads/" keeps buckets tidy.
 */
export function randomUploadKey(filename: string): string {
  const safe = (filename || "file.pdf").toLowerCase().replace(/[^a-z0-9.\-_]/g, "-").slice(-60);
  const rand = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `uploads/${rand}-${safe}`;
}
