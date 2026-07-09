// Shared CORS helper.
//
// Behaviour:
// - If ALLOWED_ORIGINS secret is set (comma-separated), echo the request
//   Origin only when it matches; otherwise fall back to the first allowed
//   origin (never `*`).
// - If ALLOWED_ORIGINS is unset, fall back to `*` so local dev/preview
//   continues to work. Production MUST set ALLOWED_ORIGINS.
// - Always sets `Vary: Origin` so CDNs don't cross-cache responses.
//
// Usage:
//   const corsHeaders = buildCorsHeaders(req);
//   if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, " +
  "x-supabase-client-platform, x-supabase-client-platform-version, " +
  "x-supabase-client-runtime, x-supabase-client-runtime-version";

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  let allowOrigin: string;

  if (ALLOWED.length === 0) {
    allowOrigin = "*";
  } else if (ALLOWED.includes(origin)) {
    allowOrigin = origin;
  } else {
    allowOrigin = ALLOWED[0];
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}
