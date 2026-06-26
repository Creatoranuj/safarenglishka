// Notion public-page proxy. Fetches recordMap for a public Notion page so we
// can render it in-app via react-notion-x. Returns JSON only (small payload,
// ~30-80 KB per page), unlike pdf-proxy which streams binary.
//
// Why server-side: notion.so/api/v3 does not allow cross-origin requests from
// arbitrary browsers. A 1-shot JSON proxy is the lightest possible bridge.
//
// Endpoint: GET /notion-page?id=<pageId-with-or-without-hyphens>
import { NotionAPI } from "npm:notion-client@7.1.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const PAGE_ID_RE = /^[0-9a-f]{32}$/i;

/** Normalise a page id: strip hyphens, lowercase. */
function normalizeId(raw: string): string | null {
  const stripped = raw.replace(/-/g, "").toLowerCase();
  if (!PAGE_ID_RE.test(stripped)) return null;
  // Notion expects hyphenated UUID form
  return `${stripped.slice(0, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}-${stripped.slice(16, 20)}-${stripped.slice(20)}`;
}

const notion = new NotionAPI();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const rawId = url.searchParams.get("id");
    if (!rawId) {
      return new Response(JSON.stringify({ error: "missing id param" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pageId = normalizeId(rawId);
    if (!pageId) {
      return new Response(JSON.stringify({ error: "invalid page id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recordMap = await notion.getPage(pageId);

    // Backfill any block ids that are referenced anywhere in the recordMap
    // (content arrays, collection_query rows, format covers, subpage links,
    // synced-block source ids, etc.) but weren't returned by getPage. The
    // previous version only scanned `value.content`, which is why DPP /
    // Notes pages that store children inside collections (database views)
    // kept logging "missing block 36d8ce59-…" and rendered blank.
    //
    // Strategy: regex every 32-hex UUID out of the serialized recordMap,
    // diff against known block ids, fetch the missing ones in chunks of 100
    // (Notion's per-call cap), and loop a few passes because newly fetched
    // blocks may themselves reference more children.
    const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    try {
      for (let pass = 0; pass < 4; pass += 1) {
        const known = new Set(Object.keys(recordMap.block || {}));
        // Serialize once per pass. ~50-200KB; cheap compared to a getBlocks RTT.
        const serialized = JSON.stringify(recordMap);
        const referenced = new Set<string>();
        for (const match of serialized.matchAll(UUID_RE)) {
          referenced.add(match[0].toLowerCase());
        }
        const missing = [...referenced].filter((id) => !known.has(id));
        if (missing.length === 0) break;
        // Notion getBlocks is capped at 100 ids per call.
        for (let i = 0; i < missing.length; i += 100) {
          const chunk = missing.slice(i, i + 100);
          const fetched = await notion.getBlocks(chunk);
          Object.assign(recordMap.block, fetched.recordMap.block);
        }
      }
    } catch (backfillErr) {
      console.warn("[notion-page] backfill failed", backfillErr);
    }


    return new Response(JSON.stringify({ recordMap }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // Edge cache: Notion pages change rarely; 5 min is safe.
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
