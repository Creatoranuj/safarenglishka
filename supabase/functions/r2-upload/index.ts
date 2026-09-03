// r2-upload — admin/teacher PDF upload straight to Cloudflare R2.
// R2 free tier: 10 GB storage, $0 egress → PDF egress never touches the
// Supabase 5 GB/month meter again.
//
// POST (Authorization: Bearer <jwt>)
//   headers: x-filename: "chapter-1.pdf"  (optional, sanitized)
//   body:    raw PDF bytes
// → 200 { ok: true, url, key, bytes }
//
// Security model (red-team pass):
//  - Auth: valid Supabase session + admin/teacher role. Students get 403.
//  - Type: magic-byte check — body must start with "%PDF-". Content-Type
//    header is client-controlled and therefore NOT trusted.
//  - Size: 100 MB hard cap (R2 object limit is huge; this guards worker RAM
//    and abuse). Content-Length AND actual buffered bytes are both checked.
//  - Key: crypto-random 128-bit prefix (randomUploadKey) → enumeration
//    infeasible. Caller-supplied filename is sanitized to [a-z0-9.-_] only
//    (no path traversal — "/" and ".." can never survive).
//  - The returned URL is public (bucket policy). Same accepted risk as the
//    existing jsDelivr-hosted PDFs: link sharing is possible; the proxy's
//    enrollment gate remains the primary paywall for Drive-hosted content.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getR2, r2Put, r2Url, randomUploadKey } from "../_shared/r2.ts";

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const r2 = getR2();
  if (!r2) return json(503, { error: "R2 is not configured on the server" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY) return json(500, { error: "Server misconfigured" });

  // 1) Authenticate
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return json(401, { error: "Unauthorized" });
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !userData?.user?.id) return json(401, { error: "Unauthorized" });

  // 2) Authorize — staff only
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: roles } = await admin
    .from("user_roles").select("role").eq("user_id", userData.user.id).in("role", ["admin", "teacher"]);
  if (!roles || roles.length === 0) return json(403, { error: "Staff only" });

  // 3) Size guard — header first (cheap), actual bytes after buffering
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > MAX_BYTES) return json(413, { error: "File exceeds 100 MB limit" });

  let body: ArrayBuffer;
  try {
    body = await req.arrayBuffer();
  } catch {
    return json(400, { error: "Could not read body" });
  }
  if (body.byteLength === 0) return json(400, { error: "Empty file" });
  if (body.byteLength > MAX_BYTES) return json(413, { error: "File exceeds 100 MB limit" });

  // 4) Magic-byte validation — must be a real PDF, not an .html/.svg polyglot
  const head = new Uint8Array(body.slice(0, 5));
  const magic = String.fromCharCode(...head);
  if (magic !== "%PDF-") return json(415, { error: "Only PDF files are accepted" });

  // 5) Upload under an unguessable random key
  const filename = req.headers.get("x-filename") || "document.pdf";
  const key = randomUploadKey(filename);
  const blob = new Blob([body], { type: "application/pdf" });
  const ok = await r2Put(r2, key, blob, "application/pdf");
  if (!ok) return json(502, { error: "R2 upload failed" });

  console.info("[r2-upload] stored", { key, bytes: body.byteLength, by: userData.user.id });
  return json(200, { ok: true, url: r2Url(r2, key), key, bytes: body.byteLength });
});
