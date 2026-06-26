import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!LOVABLE_API_KEY) return null;

  // Use Lovable AI gateway to generate embeddings via Gemini
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: "You are an embedding generator. Return ONLY a JSON array of 768 floating point numbers representing the semantic embedding of the input text. No other text.",
        },
        {
          role: "user",
          content: `Generate a 768-dimensional embedding vector for this text. Return ONLY the JSON array, nothing else:\n\n"${text.slice(0, 2000)}"`,
        },
      ],
      temperature: 0,
      max_tokens: 8000,
    }),
  });

  if (!res.ok) {
    console.error("Embedding generation failed:", res.status);
    return null;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";

  try {
    // Extract JSON array from response
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const arr = JSON.parse(match[0]);
    if (Array.isArray(arr) && arr.length === 768) return arr;
    return null;
  } catch {
    console.error("Failed to parse embedding response");
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { text, knowledgeBaseId, action } = await req.json();

    if (action === "embed_knowledge" && knowledgeBaseId) {
      // Fetch the knowledge base entry and generate+store its embedding
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { data: entry } = await supabase
        .from("knowledge_base")
        .select("title, content")
        .eq("id", knowledgeBaseId)
        .single();

      if (!entry) {
        return new Response(JSON.stringify({ error: "Entry not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const combinedText = `${entry.title}\n\n${entry.content}`;
      const embedding = await generateEmbedding(combinedText);

      if (!embedding) {
        return new Response(
          JSON.stringify({ error: "Failed to generate embedding" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabase
        .from("knowledge_base")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", knowledgeBaseId);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "query" && text) {
      // Generate embedding for a query text and return it
      const embedding = await generateEmbedding(text);
      if (!embedding) {
        return new Response(
          JSON.stringify({ error: "Failed to generate embedding" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ embedding }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid request. Provide action: 'embed_knowledge' or 'query'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-embedding error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
