import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BUNNY_API_KEY = Deno.env.get("BUNNY_API_KEY");
    const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE");
    const BUNNY_CDN_HOSTNAME = Deno.env.get("BUNNY_CDN_HOSTNAME");
    const BUNNY_STORAGE_HOSTNAME = Deno.env.get("BUNNY_STORAGE_HOSTNAME") || "storage.bunnycdn.com";

    if (!BUNNY_API_KEY || !BUNNY_STORAGE_ZONE) {
      return new Response(
        JSON.stringify({ error: "Bunny.net credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, fileName, fileBase64, contentType, folder } = await req.json();

    // ── UPLOAD ──
    if (action === "upload") {
      if (!fileName || !fileBase64) {
        return new Response(
          JSON.stringify({ error: "Missing fileName or fileBase64" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const binaryData = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      const uploadUrl = `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${fileName}`;

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          AccessKey: BUNNY_API_KEY,
          "Content-Type": contentType || "application/octet-stream",
        },
        body: binaryData,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        return new Response(
          JSON.stringify({ error: `Upload failed: ${errText}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cdnUrl = BUNNY_CDN_HOSTNAME
        ? `https://${BUNNY_CDN_HOSTNAME}/${fileName}`
        : `https://${BUNNY_STORAGE_ZONE}.b-cdn.net/${fileName}`;

      return new Response(
        JSON.stringify({ success: true, cdnUrl, fileName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── LIST ──
    if (action === "list") {
      const listPath = folder ? `${BUNNY_STORAGE_ZONE}/${folder}/` : `${BUNNY_STORAGE_ZONE}/`;
      const listUrl = `https://${BUNNY_STORAGE_HOSTNAME}/${listPath}`;

      const listRes = await fetch(listUrl, {
        headers: { AccessKey: BUNNY_API_KEY, Accept: "application/json" },
      });

      if (!listRes.ok) {
        const errText = await listRes.text();
        return new Response(
          JSON.stringify({ error: `List failed: ${errText}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const files = await listRes.json();
      const cdnBase = BUNNY_CDN_HOSTNAME || `${BUNNY_STORAGE_ZONE}.b-cdn.net`;
      const mapped = files.map((f: any) => ({
        name: f.ObjectName,
        cdnUrl: `https://${cdnBase}/${folder ? folder + "/" : ""}${f.ObjectName}`,
        size: f.Length,
      }));

      return new Response(
        JSON.stringify({ files: mapped }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── STREAM URL ──
    if (action === "stream-url") {
      if (!fileName) {
        return new Response(
          JSON.stringify({ error: "Missing fileName" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cdnBase = BUNNY_CDN_HOSTNAME || `${BUNNY_STORAGE_ZONE}.b-cdn.net`;
      const cdnUrl = `https://${cdnBase}/${fileName}`;

      return new Response(
        JSON.stringify({ cdnUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use: upload, list, stream-url" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
