import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{10,200}$/;

const headersWithCors = (extra: HeadersInit = {}) => ({
  ...corsHeaders,
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, content-type",
  ...extra,
});

Deno.serve(async (req) => {
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
      const upstreamUrl = await fetchRemoteFile(target, req.headers.get("range"));
      return relayUpstream(upstreamUrl, req.method);
    }

    if (kind !== "drive" || !DRIVE_ID_RE.test(id)) {
      return new Response(JSON.stringify({ error: "Valid Drive file id is required" }), {
        status: 400,
        headers: headersWithCors({ "Content-Type": "application/json" }),
      });
    }

    const upstream = await fetchDriveFile(id, req.headers.get("range"));
    if (!upstream.ok || !upstream.body) {
      return new Response(JSON.stringify({ error: `Drive fetch failed: ${upstream.status}` }), {
        status: upstream.status || 502,
        headers: headersWithCors({ "Content-Type": "application/json" }),
      });
    }

    const outHeaders: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") || "application/pdf",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
    };
    for (const h of ["content-length", "content-range", "etag", "last-modified"]) {
      const v = upstream.headers.get(h);
      if (v) outHeaders[h] = v;
    }

    return new Response(req.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: headersWithCors(outHeaders),
    });
  } catch (error) {
    console.error("pdf-proxy error", error);
    return new Response(JSON.stringify({ error: "PDF proxy failed" }), {
      status: 500,
      headers: headersWithCors({ "Content-Type": "application/json" }),
    });
  }
});

// Allow-list of trusted direct PDF CDNs proxied via kind=url. Keep this tight
// so the function can't be abused as an open proxy.
const ALLOWED_HOSTS = [
  /(^|\.)cdn\.jsdelivr\.net$/i,
  /(^|\.)raw\.githubusercontent\.com$/i,
  /(^|\.)github-storages-cdn\.vercel\.app$/i,
  /(^|\.)storage-naveenbharat-recording\.vercel\.app$/i,
];

function isAllowedPdfUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

async function fetchRemoteFile(url: string, range: string | null): Promise<Response> {
  const headers = new Headers({
    Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
  if (range) headers.set("Range", range);
  return fetch(url, { headers, redirect: "follow" });
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
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
  };
  for (const h of ["content-length", "content-range", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) outHeaders[h] = v;
  }
  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: headersWithCors(outHeaders),
  });
}



async function fetchDriveFile(id: string, range: string | null): Promise<Response> {
  const baseHeaders = new Headers({
    Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
  if (range) baseHeaders.set("Range", range);

  // 1) Direct usercontent endpoint — typically serves the file without an interstitial.
  const directUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
    id,
  )}&export=download&authuser=0&confirm=t`;
  let res = await fetch(directUrl, { headers: baseHeaders, redirect: "follow" });
  let ct = res.headers.get("content-type") || "";
  if (res.ok && !/text\/html/i.test(ct)) return res;

  // 2) Fallback to legacy uc endpoint and parse confirm token / hidden form.
  const ucUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  res = await fetch(ucUrl, { headers: baseHeaders, redirect: "follow" });
  ct = res.headers.get("content-type") || "";
  if (!/text\/html/i.test(ct)) return res;

  const html = await res.text();
  const cookie = res.headers.get("set-cookie")?.split(";")[0];

  // Newer Drive interstitial is a <form action="https://drive.usercontent.google.com/download">
  // with hidden inputs: id, export, confirm, uuid.
  const formAction = html.match(/<form[^>]+action="([^"]+download[^"]*)"/i)?.[1];
  const hiddenInputs: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi)) {
    hiddenInputs[m[1]] = m[2].replace(/&amp;/g, "&");
  }

  if (formAction && Object.keys(hiddenInputs).length) {
    const qs = new URLSearchParams(hiddenInputs).toString();
    const confirmedHeaders = new Headers(baseHeaders);
    if (cookie) confirmedHeaders.set("Cookie", cookie);
    const followUrl = `${formAction.replace(/&amp;/g, "&")}?${qs}`;
    res = await fetch(followUrl, { headers: confirmedHeaders, redirect: "follow" });
    return res;
  }

  // Legacy ?confirm=XYZ token style
  const token = html.match(/[?&]confirm=([0-9A-Za-z_\-]+)/)?.[1];
  if (token) {
    const confirmedHeaders = new Headers(baseHeaders);
    if (cookie) confirmedHeaders.set("Cookie", cookie);
    res = await fetch(`${ucUrl}&confirm=${encodeURIComponent(token)}`, {
      headers: confirmedHeaders,
      redirect: "follow",
    });
    return res;
  }

  return new Response(null, { status: 415, statusText: "Drive did not return a PDF" });
}