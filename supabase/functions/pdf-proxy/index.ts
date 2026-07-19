import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{10,200}$/;
// Hardening cap for generic allow-listed CDN proxy only. Drive PDFs are streamed
// without a size ceiling because large lecture PDFs commonly exceed 80 MB.
const DIRECT_URL_MAX_BYTES = 80 * 1024 * 1024; // 80 MB
const UPSTREAM_TIMEOUT_MS = 45_000;
// Drive throttles large PDFs (>50 MB) to ~1 MB/s; a 120s cap was clipping
// streams mid-flight → pdf.js received a truncated body → onLoadSuccess never
// fired → "Opening … 90%" stall. Give the streaming phase more headroom while
// staying under Deno Deploy's 400 s wall-clock ceiling for edge functions.
const DRIVE_UPSTREAM_TIMEOUT_MS = 300_000;

// Phase B: Drive PDF cache in Supabase Storage.
// First request pulls from Drive AND streams a copy into pdf-cache/drive/<id>.pdf.
// Subsequent requests get a 302 redirect to a signed URL served by Supabase's
// CDN with proper Range request support — pdf.js can render page 1 in seconds
// instead of waiting for the whole Drive throttled stream.
const CACHE_BUCKET = "pdf-cache";
const CACHE_SIGNED_URL_TTL = 60 * 60 * 6; // 6h signed URL; browser caches per Cache-Control below

const headersWithCors = (extra: HeadersInit = {}) => ({
  ...corsHeaders,
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, content-type, cache-control, cache-tag",
  ...extra,
});

// AbortSignal.timeout polyfill (Deno Deploy has it, but be explicit so the
// behavior is identical across runtimes).
const timeoutSignal = (ms: number): AbortSignal => {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new Error(`Upstream timeout after ${ms}ms`)), ms);
  return ctrl.signal;
};

const isOversize = (res: Response): boolean => {
  const len = Number(res.headers.get("content-length") || "0");
  return Number.isFinite(len) && len > DIRECT_URL_MAX_BYTES;
};

// Fire-and-forget metrics insert. We never await this — the reader's
// perceived latency must not depend on Postgres. If SUPABASE_URL /
// service-role key aren't present (local dev), we skip silently.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const adminClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// AUTH: pdf-proxy streams paid course PDFs, so every request needs a valid
// session. pdf.js loads the URL inside an <iframe>/worker that cannot set
// request headers, so the JWT may arrive either in the Authorization header
// or as a `?token=` query param.
async function authenticate(req: Request): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  let token = "";
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (!token) token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return null;
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Mirror the lesson_pdfs SELECT RLS: staff bypass, else the drive id must map
// to a free/preview lesson or a course the caller is actively enrolled in.
async function authorizeDrive(userId: string, driveId: string): Promise<boolean> {
  if (!adminClient) return false;
  const { data: roles } = await adminClient
    .from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "teacher"]);
  if (roles && roles.length > 0) return true;

  const like = `%${driveId}%`;
  const lessonIds = new Set<string>();
  const courseIds = new Set<number>();

  const { data: lp } = await adminClient
    .from("lesson_pdfs").select("lesson_id").or(`drive_id.eq.${driveId},file_url.ilike.${like}`);
  lp?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  const { data: nt } = await adminClient
    .from("notes").select("lesson_id").ilike("pdf_url", like);
  nt?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  const { data: mt } = await adminClient
    .from("materials").select("course_id").ilike("file_url", like);
  mt?.forEach((r) => { if (r.course_id != null) courseIds.add(r.course_id as number); });

  const { data: lc } = await adminClient
    .from("lessons").select("course_id, is_free, is_preview").ilike("class_pdf_url", like);
  for (const r of lc ?? []) {
    if (r.is_free || r.is_preview) return true;
    if (r.course_id != null) courseIds.add(r.course_id as number);
  }

  if (lessonIds.size > 0) {
    const { data: ls } = await adminClient
      .from("lessons").select("course_id, is_free, is_preview").in("id", [...lessonIds]);
    for (const r of ls ?? []) {
      if (r.is_free || r.is_preview) return true;
      if (r.course_id != null) courseIds.add(r.course_id as number);
    }
  }

  if (courseIds.size === 0) return false;

  const { data: enr } = await adminClient
    .from("enrollments").select("course_id")
    .eq("user_id", userId).eq("status", "active").in("course_id", [...courseIds]);
  return !!(enr && enr.length > 0);
}

// Same enrollment gate as authorizeDrive, but for CDN-hosted PDFs.
// Resolves the target URL back to its owning lesson/course by matching
// lesson_pdfs.file_url / notes.pdf_url / materials.file_url / lessons.class_pdf_url,
// then allows staff / free lesson / active enrollment.
async function authorizeUrl(userId: string, url: string): Promise<boolean> {
  if (!adminClient) return false;
  const { data: roles } = await adminClient
    .from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "teacher"]);
  if (roles && roles.length > 0) return true;

  const lessonIds = new Set<string>();
  const courseIds = new Set<number>();

  const { data: lp } = await adminClient
    .from("lesson_pdfs").select("lesson_id").eq("file_url", url);
  lp?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  const { data: nt } = await adminClient
    .from("notes").select("lesson_id").eq("pdf_url", url);
  nt?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  const { data: mt } = await adminClient
    .from("materials").select("course_id").eq("file_url", url);
  mt?.forEach((r) => { if (r.course_id != null) courseIds.add(r.course_id as number); });

  // study_materials — admin uploads a Drive/CDN link here (external_url) or a
  // storage-hosted file (file_url). Without these lookups the enrollment
  // resolver falls through to "courseIds empty → deny", which was breaking
  // every jsDelivr-hosted lecture PDF added via the Study Materials admin.
  // SECURITY: use two parameterized .eq() queries instead of interpolating
  // user input into an .or() filter string — a comma in the URL would inject
  // extra PostgREST conditions and let a caller bypass the enrollment gate.
  const [smExt, smFile] = await Promise.all([
    adminClient.from("study_materials").select("course_id").eq("external_url", url),
    adminClient.from("study_materials").select("course_id").eq("file_url", url),
  ]);
  smExt.data?.forEach((r) => { if (r.course_id != null) courseIds.add(r.course_id as number); });
  smFile.data?.forEach((r) => { if (r.course_id != null) courseIds.add(r.course_id as number); });

  // lesson_attachments — enrolled-user-visible chip attachments.
  const { data: la } = await adminClient
    .from("lesson_attachments").select("lesson_id").eq("file_url", url);
  la?.forEach((r) => { if (r.lesson_id) lessonIds.add(r.lesson_id as string); });

  const { data: lc } = await adminClient
    .from("lessons").select("course_id, is_free, is_preview").eq("class_pdf_url", url);
  for (const r of lc ?? []) {
    if (r.is_free || r.is_preview) return true;
    if (r.course_id != null) courseIds.add(r.course_id as number);
  }

  if (lessonIds.size > 0) {
    const { data: ls } = await adminClient
      .from("lessons").select("course_id, is_free, is_preview").in("id", [...lessonIds]);
    for (const r of ls ?? []) {
      if (r.is_free || r.is_preview) return true;
      if (r.course_id != null) courseIds.add(r.course_id as number);
    }
  }

  // Unknown URL — not tied to any paid content row. Deny by default so
  // the proxy can't be used to bypass future paywalls; add explicit rows
  // if a URL needs to be freely accessible.
  if (courseIds.size === 0) return false;

  const { data: enr } = await adminClient
    .from("enrollments").select("course_id")
    .eq("user_id", userId).eq("status", "active").in("course_id", [...courseIds]);
  return !!(enr && enr.length > 0);
}

const metricsClient = adminClient;

// Note: bucket file-size limit is enforced project-wide by Supabase Storage
// (default 50 MiB on managed projects). We cap the tee-upload at 48 MB
// (see cacheDriveBodyInBackground) and rely on the Supabase edge CDN for
// bigger PDFs — the immutable Cache-Control we set on Drive responses is
// enough for ~10× repeat-open speedup.
const bootstrapAttempted = true;
async function ensureCacheBucketConfigured() { void bootstrapAttempted; }



function recordMetric(row: { event: string; drive_id?: string | null; tier?: string | null; last_status?: number | null; last_content_type?: string | null }) {
  if (!metricsClient) return;
  // Never let a logging failure surface to the caller.
  try {
    Promise.resolve(metricsClient.from("pdf_proxy_metrics").insert(row))
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.warn("[pdf-proxy:metrics]", error.message);
      })
      .catch((err: unknown) => console.warn("[pdf-proxy:metrics]", err));
  } catch (err) { console.warn("[pdf-proxy:metrics]", err); }
}

/**
 * Try to short-circuit a Drive request by redirecting to a signed URL in the
 * pdf-cache bucket. Returns a 302 Response on cache hit, null on miss.
 */
async function tryCacheRedirect(driveId: string): Promise<Response | null> {
  if (!adminClient) return null;
  const path = `drive/${driveId}.pdf`;
  try {
    // HEAD-style existence check via createSignedUrl — cheap, no download.
    // Supabase returns 400/404 in `error` when the object is missing.
    const { data, error } = await adminClient.storage
      .from(CACHE_BUCKET)
      .createSignedUrl(path, CACHE_SIGNED_URL_TTL);
    if (error || !data?.signedUrl) return null;
    recordMetric({ event: "drive_cache_hit", drive_id: driveId, tier: "cache", last_status: 302 });
    return new Response(null, {
      status: 302,
      headers: headersWithCors({
        Location: data.signedUrl,
        "Cache-Control": "public, max-age=300",
        "X-Pdf-Cache": "hit",
      }),
    });
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: buffer the tee'd Drive response body and upload to
 * pdf-cache. Runs concurrently with the streaming response to the browser.
 * Uses EdgeRuntime.waitUntil so Supabase keeps the worker alive after the
 * response stream ends — otherwise the tee upload gets killed mid-flight.
 */
function cacheDriveBodyInBackground(driveId: string, bodyStream: ReadableStream<Uint8Array>, contentType: string) {
  if (!adminClient) return;
  const path = `drive/${driveId}.pdf`;
  const work = (async () => {
    try {
      const reader = bodyStream.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      // Supabase Storage enforces a project-level per-object cap (default
      // 50 MiB on managed projects). Skip caching when a PDF would exceed
      // that — the Supabase edge CDN already gives a ~10× speedup on repeat
      // opens for larger PDFs via the immutable Cache-Control we set below.
      const MAX = 48 * 1024 * 1024;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX) { console.warn("[pdf-proxy:cache] oversize, skipping", driveId, total); return; }
          chunks.push(value);
        }
      }
      // Concatenate to a single Uint8Array backed by a plain ArrayBuffer so
      // Blob's typings accept it (Deno's Uint8Array<ArrayBufferLike> otherwise
      // trips `SharedArrayBuffer is missing…`).
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
      const blob = new Blob([merged], { type: contentType || "application/pdf" });
      const { error } = await adminClient.storage.from(CACHE_BUCKET).upload(path, blob, {
        contentType: contentType || "application/pdf",
        upsert: true,
        cacheControl: "31536000",
      });
      if (error) {
        console.warn("[pdf-proxy:cache] upload failed", driveId, error.message);
      } else {
        console.info("[pdf-proxy:cache] stored", driveId, total);
        recordMetric({ event: "drive_cache_store", drive_id: driveId, tier: "cache", last_status: 200 });
      }
    } catch (err) {
      console.warn("[pdf-proxy:cache] tee error", driveId, (err as Error).message);
    }
  })();
  try {
    (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
      .EdgeRuntime?.waitUntil(work);
  } catch { /* no waitUntil available (local Deno run) — work still runs, may be killed */ }
}

Deno.serve(async (req) => {
  // Best-effort one-time bucket config (fire-and-forget; no await).
  ensureCacheBucketConfigured();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: headersWithCors() });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: headersWithCors({ "Content-Type": "application/json" }),
    });
  }

  try {
    const input = new URL(req.url);
    const kind = input.searchParams.get("kind");
    const id = input.searchParams.get("id") || "";

    // Require a valid session for every proxied fetch (paid course content).
    const userId = await authenticate(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: headersWithCors({ "Content-Type": "application/json" }),
      });
    }


    // kind=url → generic CORS-safe proxy for allow-listed direct PDF CDNs
    // (jsDelivr, GitHub raw, etc). The web/native reader routes every
    // jsDelivr-hosted Class Notes PDF through here via remotePdfProxyUrl().
    if (kind === "url") {
      const target = input.searchParams.get("url") || "";
      if (!isAllowedPdfUrl(target)) {
        return new Response(JSON.stringify({ error: "URL not allowed" }), {
          status: 400,
          headers: headersWithCors({ "Content-Type": "application/json" }),
        });
      }
      // Enrollment/ownership gate — mirrors the Drive branch below so the
      // generic CDN proxy can't be used to bypass payment for paid PDFs.
      if (!(await authorizeUrl(userId, target))) {
        return new Response(JSON.stringify({ error: "Not authorized for this file" }), {
          status: 403,
          headers: headersWithCors({ "Content-Type": "application/json" }),
        });
      }
      const rangeHeader = req.headers.get("range");
      const upstreamUrl = await fetchRemoteFile(target, rangeHeader);
      // Skip the oversize check when a Range was requested — content-length
      // is the chunk size, not the full file. pdf.js relies on Range for
      // fast first-page paint of large PDFs.
      if (!rangeHeader && isOversize(upstreamUrl)) {
        return new Response(JSON.stringify({ error: "PDF exceeds 80 MB limit" }), {
          status: 413,
          headers: headersWithCors({ "Content-Type": "application/json" }),
        });
      }
      recordMetric({
        event: "url_success",
        tier: "url",
        last_status: upstreamUrl.status,
        last_content_type: upstreamUrl.headers.get("content-type"),
      });
      return relayUpstream(upstreamUrl, req.method);
    }

    if (kind !== "drive" || !DRIVE_ID_RE.test(id)) {
      return new Response(JSON.stringify({ error: "Valid Drive file id is required" }), {
        status: 400,
        headers: headersWithCors({ "Content-Type": "application/json" }),
      });
    }

    // Enrollment/ownership gate — mirrors the lesson_pdfs SELECT RLS so this
    // proxy can't be used to bypass payment for Drive-hosted lecture PDFs.
    if (!(await authorizeDrive(userId, id))) {
      return new Response(JSON.stringify({ error: "Not authorized for this file" }), {
        status: 403,
        headers: headersWithCors({ "Content-Type": "application/json" }),
      });
    }



    // Phase B: cache hit → 302 to signed Supabase Storage URL. The client
    // then streams from Supabase's CDN with real Range support so pdf.js
    // renders page 1 in seconds. Skip cache lookup on HEAD (client is
    // probing) and when caller explicitly asks for `no-cache`.
    if (req.method === "GET" && req.headers.get("cache-control") !== "no-cache") {
      const hit = await tryCacheRedirect(id);
      if (hit) return hit;
    }

    // Cache miss — fetch from Drive and tee the body: one stream to the
    // browser, one to the storage upload (fire-and-forget).
    const upstream = await fetchDriveFile(id);
    if (!upstream.ok || !upstream.body) {
      const privateLike = upstream.status === 403 || upstream.status === 404 || upstream.status === 415;
      return new Response(JSON.stringify({
        error: privateLike
          ? "This Drive file is private — ask the uploader to enable link sharing."
          : `Drive fetch failed: ${upstream.status}`,
        type: privateLike ? "drive_private" : "drive_fetch_failed",
        fallback: false,
      }), {
        status: upstream.status || 502,
        headers: headersWithCors({ "Content-Type": "application/json" }),
      });
    }

    const upstreamLen = upstream.headers.get("content-length");
    const upstreamType = upstream.headers.get("content-type") || "application/pdf";
    const outHeaders: Record<string, string> = {
      "Content-Type": upstreamType,
      "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable, no-transform",
      "CDN-Cache-Control": "public, max-age=86400, immutable, no-transform",
      "Cache-Tag": `drive:${id}`,
      "Accept-Ranges": "none",
      "Content-Encoding": "identity",
      "X-Pdf-Cache": "miss",
    };
    const upstreamEnc = (upstream.headers.get("content-encoding") || "").toLowerCase();
    if (upstreamLen && (upstreamEnc === "" || upstreamEnc === "identity")) {
      outHeaders["Content-Length"] = upstreamLen;
    }
    for (const h of ["etag", "last-modified"]) {
      const v = upstream.headers.get(h);
      if (v) outHeaders[h] = v;
    }

    if (req.method === "HEAD") {
      return new Response(null, { status: upstream.status, headers: headersWithCors(outHeaders) });
    }

    // Tee: one branch streams to the client, the other buffers for the
    // pdf-cache upload. Client latency is unaffected — the upload runs
    // concurrently and any failure is logged, never surfaced.
    const [toClient, toCache] = upstream.body.tee();
    cacheDriveBodyInBackground(id, toCache, upstreamType);

    return new Response(toClient, {
      status: upstream.status,
      headers: headersWithCors(outHeaders),
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = /timeout/i.test(message) || (error as { name?: string })?.name === "AbortError";
    console.error("pdf-proxy error", message);
    return new Response(JSON.stringify({ error: isTimeout ? "Upstream PDF timed out" : "PDF proxy failed" }), {
      status: isTimeout ? 504 : 500,
      headers: headersWithCors({ "Content-Type": "application/json" }),
    });
  }
});

// Allow-list of trusted direct PDF CDNs proxied via kind=url. Keep this tight
// so the function can't be abused as an open proxy.
const ALLOWED_HOSTS = [
  /(^|\.)cdn\.jsdelivr\.net$/i,
  /(^|\.)raw\.githubusercontent\.com$/i,
  /(^|\.)blob\.core\.windows\.net$/i,
  /(^|\.)github-storages-cdn\.vercel\.app$/i,
  /(^|\.)storage-safarenglishka-recording\.vercel\.app$/i,
];

export function isAllowedPdfUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    // SSRF guard: https only, no credentials, no non-default ports, no
    // IP-literal hosts (defeats DNS-rebinding / localhost / 169.254.169.254
    // metadata abuse), allow-listed CDN hostnames only.
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.port && u.port !== "443") return false;
    const host = u.hostname;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false; // IPv4 literal
    if (host.includes(":")) return false;                 // IPv6 literal
    if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host)) return false;
    return ALLOWED_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

// Manually follow up to N redirects, re-validating each hop against the
// allow-list. `redirect: "follow"` would let a compromised or misconfigured
// CDN 302 the proxy into `http://169.254.169.254/…` or another private host;
// re-validating at every hop closes that SSRF gap.
const MAX_REDIRECTS = 3;

async function fetchRemoteFile(url: string, range: string | null): Promise<Response> {
  const headers = new Headers({
    Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
  if (range) headers.set("Range", range);

  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedPdfUrl(currentUrl)) {
      // Synthesize a 502 so the caller sees an upstream failure instead of
      // us silently opening a hole to a private host.
      return new Response(
        JSON.stringify({ error: "Upstream redirected to a disallowed host" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
    const res = await fetch(currentUrl, {
      headers,
      redirect: "manual",
      signal: timeoutSignal(UPSTREAM_TIMEOUT_MS),
    });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    // Drain redirect body to avoid Deno resource leak warnings.
    await res.body?.cancel().catch(() => {});
    if (!loc) return res;
    try {
      currentUrl = new URL(loc, currentUrl).toString();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid redirect target" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
  }
  return new Response(
    JSON.stringify({ error: "Too many redirects" }),
    { status: 502, headers: { "Content-Type": "application/json" } },
  );
}

function relayUpstream(upstream: Response, method: string): Response {
  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: `Upstream fetch failed: ${upstream.status}` }), {
      status: upstream.status || 502,
      headers: headersWithCors({ "Content-Type": "application/json" }),
    });
  }
  const outHeaders: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") || "application/pdf",
    "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
    "CDN-Cache-Control": "public, max-age=86400, immutable",
    "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
  };
  // See Drive branch above: forwarding Content-Length from a relayed upstream
  // can make pdf.js abort on mobile when the body size differs after fetch
  // normalization. Chunked framing is safer for all proxied CDNs.
  for (const h of ["content-range", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) outHeaders[h] = v;
  }
  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: headersWithCors(outHeaders),
  });
}



/**
 * Fallback chain for Google Drive PDFs. Each tier is logged with
 * `[pdf-proxy:drive]` so we can see in Supabase logs which path actually
 * served the file (telemetry).
 *
 *   tier 1: drive.usercontent.google.com/download?confirm=t
 *   tier 2: drive.google.com/uc — parse the interstitial <form> + cookie
 *   tier 3: drive.google.com/uc&confirm=<legacy-token>
 *   tier 4: docs.google.com/uc?export=download  (older mirror)
 */
async function fetchDriveFile(id: string): Promise<Response> {
  const baseHeaders = new Headers({
    Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
    // Force identity so `Content-Length` we forward matches the actual byte
    // stream. Without this, Drive may respond with gzip/br and the length
    // we forward is the compressed size — pdf.js then aborts near the tail
    // with "Content-Length header ... exceeds response Body".
    "Accept-Encoding": "identity",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });

  const log = (tier: string, info: Record<string, unknown>) =>
    console.info("[pdf-proxy:drive]", tier, { id, ...info });

  const driveFetch = (url: string, headers: Headers) =>
    fetch(url, { headers, redirect: "follow", signal: timeoutSignal(DRIVE_UPSTREAM_TIMEOUT_MS) });

  // tier 1
  // acknowledgeAbuse=true bypasses the "can't scan for viruses" interstitial
  // that large Drive PDFs (>25MB) always hit — this is the #1 cause of the
  // "blank/could not load" reports from students opening lecture Drive links.
  const directUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&authuser=0&confirm=t&acknowledgeAbuse=true`;
  let res = await driveFetch(directUrl, baseHeaders);
  let ct = res.headers.get("content-type") || "";
  log("tier1-direct", { status: res.status, ct });
  if (res.ok && !/text\/html/i.test(ct)) {
    recordMetric({ event: "drive_success", drive_id: id, tier: "tier1-direct", last_status: res.status, last_content_type: ct });
    return res;
  }

  // tier 2
  const ucUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}&acknowledgeAbuse=true`;
  res = await driveFetch(ucUrl, baseHeaders);
  ct = res.headers.get("content-type") || "";
  log("tier2-uc", { status: res.status, ct });
  if (!/text\/html/i.test(ct)) {
    recordMetric({ event: "drive_success", drive_id: id, tier: "tier2-uc", last_status: res.status, last_content_type: ct });
    return res;
  }

  const html = await res.text();
  const cookie = res.headers.get("set-cookie")?.split(";")[0];

  const formAction = html.match(/<form[^>]+action="([^"]+download[^"]*)"/i)?.[1];
  const hiddenInputs: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi)) {
    hiddenInputs[m[1]] = m[2].replace(/&amp;/g, "&");
  }

  if (formAction && Object.keys(hiddenInputs).length) {
    const qs = new URLSearchParams(hiddenInputs).toString();
    const confirmedHeaders = new Headers(baseHeaders);
    if (cookie) confirmedHeaders.set("Cookie", cookie);
    const sep = formAction.includes("?") ? "&" : "?";
    const followUrl = `${formAction.replace(/&amp;/g, "&")}${sep}${qs}&acknowledgeAbuse=true`;
    res = await driveFetch(followUrl, confirmedHeaders);
    ct = res.headers.get("content-type") || "";
    log("tier2-form", { status: res.status, ct });
    if (res.ok && !/text\/html/i.test(ct)) {
      recordMetric({ event: "drive_success", drive_id: id, tier: "tier2-form", last_status: res.status, last_content_type: ct });
      return res;
    }
  }

  // tier 3 — legacy confirm token
  const token = html.match(/[?&]confirm=([0-9A-Za-z_\-]+)/)?.[1];
  if (token) {
    const confirmedHeaders = new Headers(baseHeaders);
    if (cookie) confirmedHeaders.set("Cookie", cookie);
    res = await driveFetch(`${ucUrl}&confirm=${encodeURIComponent(token)}`, confirmedHeaders);
    ct = res.headers.get("content-type") || "";
    log("tier3-token", { status: res.status, ct });
    if (res.ok && !/text\/html/i.test(ct)) {
      recordMetric({ event: "drive_success", drive_id: id, tier: "tier3-token", last_status: res.status, last_content_type: ct });
      return res;
    }
  }

  // tier 4 — docs.google.com mirror (older Drive ids still resolve here)
  const docsUrl = `https://docs.google.com/uc?export=download&id=${encodeURIComponent(id)}&acknowledgeAbuse=true`;
  res = await driveFetch(docsUrl, baseHeaders);
  ct = res.headers.get("content-type") || "";
  log("tier4-docs", { status: res.status, ct });
  if (res.ok && !/text\/html/i.test(ct)) {
    recordMetric({ event: "drive_success", drive_id: id, tier: "tier4-docs", last_status: res.status, last_content_type: ct });
    return res;
  }

  log("exhausted", { lastStatus: res.status });
  recordMetric({ event: "drive_exhausted", drive_id: id, tier: "exhausted", last_status: res.status, last_content_type: ct });
  return new Response(null, { status: 415, statusText: "Drive did not return a PDF" });
}