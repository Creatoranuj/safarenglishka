import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// v4: force redeploy — lesson-scoped chat accepts { lesson, message, history }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      sessionId,
      description,
      subject,
      message,
      lesson,
      history,
    }: {
      sessionId?: string;
      description?: string;
      subject?: string;
      message?: string;
      lesson?: {
        title?: string;
        videoUrl?: string;
        youtubeId?: string;
        description?: string;
        overview?: string;
        transcript?: string;
        course?: string;
        chapter?: string;
      };
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    } = body ?? {};

    // New lesson-scoped chat flow (no DB write, session-only).
    const isLessonChat = !!lesson && !!message;
    const userText = (isLessonChat ? message : description)?.trim();

    if (!userText) {
      return new Response(
        JSON.stringify({ error: "message or description required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!isLessonChat && !sessionId) {
      return new Response(
        JSON.stringify({ error: "sessionId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let session: { student_id: string } | null = null;
    if (!isLessonChat) {
      const { data } = await supabaseAdmin
        .from("doubt_sessions")
        .select("student_id")
        .eq("id", sessionId)
        .single();
      session = data as any;
      if (!session?.student_id) {
        return new Response(
          JSON.stringify({ error: "Session not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // RAG retrieval (legacy flow only — lesson chat is grounded in lesson context).
    let ragContext = "";
    if (!isLessonChat) {
      const stopWords = new Set(["kaise", "karna", "hai", "hain", "mein", "the", "and", "for", "with", "this", "that"]);
      const words = userText.toLowerCase().replace(/[?!.,;:'"()]/g, " ").split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w));
      if (words.length > 0) {
        const orFilters = words.slice(0, 6).map((w: string) => `content.ilike.%${w}%,title.ilike.%${w}%`).join(",");
        const { data: kbData } = await supabaseAdmin.from("knowledge_base").select("title, content").eq("is_active", true).or(orFilters).limit(3);
        if (kbData && kbData.length > 0) {
          ragContext = "\n\nRelevant platform knowledge:\n" + kbData.map((d: any) => `- ${d.title}: ${d.content.slice(0, 300)}`).join("\n");
        }
      }
    }

    // Build system prompt
    let systemPrompt: string;
    if (isLessonChat) {
      const ctx = [
        lesson?.course ? `Course / Subject: ${lesson.course}` : null,
        lesson?.chapter ? `Chapter: ${lesson.chapter}` : null,
        lesson?.title ? `Lecture Title: ${lesson.title}` : null,
        lesson?.youtubeId ? `YouTube ID: ${lesson.youtubeId}` : null,
        lesson?.videoUrl ? `Video URL: ${lesson.videoUrl}` : null,
        lesson?.description ? `Description: ${lesson.description.slice(0, 1500)}` : null,
        lesson?.overview ? `Overview: ${lesson.overview.slice(0, 1500)}` : null,
        lesson?.transcript ? `Transcript (excerpt):\n${lesson.transcript.slice(0, 6000)}` : null,
      ].filter(Boolean).join("\n");

      const hasRealContent = !!(lesson?.transcript || lesson?.description || lesson?.overview);
      const subjectHint = lesson?.course || lesson?.chapter || "(unknown — infer ONLY from provided context, never from the lecture title alone)";

      systemPrompt =
`You are an Academic Doubt Solver AI for ONE specific lecture.

ABSOLUTE GROUNDING RULES (most important):
- The lecture's actual subject is: ${subjectHint}.
- NEVER guess the subject/topic from a generic lecture title like "Maha Marathon", "Part 2", "One Shot", "Revision", etc. Those titles do NOT tell you the subject.
- If the user asks for a "summary" / "is lecture mein kya hai" / "topics" and you do NOT have transcript/description/overview, DO NOT invent topics (no fake "Grammar Concepts", "Question Practice" lists). Instead reply briefly:
  "Is lecture ka transcript abhi available nahi hai. Aap timestamp ya specific topic batao, main wahi explain kar dunga."
- Use ONLY the lesson context below as ground truth. If something isn't in the context, say you don't have it — don't fabricate.
- The subject is ${lesson?.course ? `"${lesson.course}"` : "given above"} — answers must stay within that subject area.

Response style:
- Direct, short, precise. No greetings, no "Hello I am...", no closing motivation.
- Concept: Definition · Rule/Point · 1 short example (3–5 lines max).
- Short bullets, not paragraphs.
- Language: simple Hindi / Hinglish matching the user.
- Off-topic / personal questions → reply ONLY: "Main sirf academic doubts ka answer deta hoon."

Lesson context (ground truth — ${hasRealContent ? "use it" : "LIMITED — do not fabricate beyond it"}):
${ctx || "(no lesson context provided)"}`;
    } else {
      systemPrompt =
        "You are Naveen AI Agent, a helpful teaching assistant for Naveen Bharat coaching. Answer the student's doubt clearly and concisely in Hindi or English based on the question language. Give step-by-step explanation if needed. Keep it under 500 words." +
        ragContext;
    }

    const chatMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    if (isLessonChat && Array.isArray(history)) {
      for (const h of history.slice(-10)) {
        if (h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string") {
          chatMessages.push({ role: h.role, content: h.content });
        }
      }
      chatMessages.push({ role: "user", content: userText });
    } else {
      chatMessages.push({
        role: "user",
        content: `Subject: ${subject || "General"}\n\nDoubt: ${userText}`,
      });
    }

    // Call AI
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: chatMessages,
          temperature: isLessonChat ? 0.3 : 0.6,
        }),
      }
    );

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway returned ${status}`);
    }

    const aiData = await aiResponse.json();
    const aiMessage =
      aiData.choices?.[0]?.message?.content || "Sorry, I could not generate a response.";

    if (!isLessonChat && session?.student_id) {
      const { error: insertError } = await supabaseAdmin
        .from("doubt_replies")
        .insert({
          doubt_session_id: sessionId,
          user_id: session.student_id,
          message: aiMessage,
          is_ai: true,
        });
      if (insertError) console.error("Insert error:", insertError);
    }

    return new Response(
      JSON.stringify({ reply: aiMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("resolve-doubt error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
