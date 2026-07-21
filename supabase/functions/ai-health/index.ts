// Lightweight AI gateway health probe. Public (no auth) and cached 30s.
// Client (e.g. useLessonChat) calls once on mount to show a soft
// "reconnecting" banner instead of letting the first user turn fail hard
// with a raw "non-2xx" toast.
import { buildCorsHeaders } from "../_shared/cors.ts";
import { callAiGateway } from "../_shared/aiGateway.ts";

let cache: { at: number; body: unknown; status: number } | null = null;
const TTL_MS = 30_000;

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return new Response(JSON.stringify(cache.body), {
      status: cache.status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    const body = { ok: false, code: "not_configured" };
    cache = { at: now, body, status: 200 };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const res = await callAiGateway({
      apiKey,
      body: {
        model: "google/gemini-3.5-flash",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      },
    });

    let body: Record<string, unknown> = { ok: res.ok };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isAuth =
        (res.status === 401 || res.status === 403) &&
        (text.includes("lovable_api_key_not_registered") || text.includes("unauthorized"));
      body = {
        ok: false,
        code: isAuth ? "gateway_unauthorized" : `gateway_${res.status}`,
      };
    }
    cache = { at: now, body, status: 200 };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const body = { ok: false, code: "network_error", detail: (e as Error).message };
    // Don't cache network errors — they may resolve quickly.
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
