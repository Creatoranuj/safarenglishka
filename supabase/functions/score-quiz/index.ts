import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Validate Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Create user client (to validate JWT) and service client (to read correct_answer)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // 3. Validate JWT — get user
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // 4. Parse request body
    const { quiz_id, answers, time_taken_seconds } = await req.json() as {
      quiz_id: string;
      answers: Record<string, string>;
      time_taken_seconds: number;
    };

    if (!quiz_id || typeof answers !== "object") {
      return new Response(JSON.stringify({ error: "Missing quiz_id or answers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Fetch quiz metadata (total_marks, pass_percentage) via service client
    const { data: quiz, error: quizError } = await serviceClient
      .from("quizzes")
      .select("id, total_marks, pass_percentage")
      .eq("id", quiz_id)
      .single();

    if (quizError || !quiz) {
      return new Response(JSON.stringify({ error: "Quiz not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Fetch full questions with correct_answer via service client
    const { data: questions, error: questionsError } = await serviceClient
      .from("questions")
      .select("id, correct_answer, marks, negative_marks")
      .eq("quiz_id", quiz_id);

    if (questionsError || !questions) {
      return new Response(JSON.stringify({ error: "Failed to fetch questions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Calculate score with negative marking
    let score = 0;
    for (const q of questions) {
      const userAnswer = answers[q.id];
      if (userAnswer !== undefined && userAnswer !== null && userAnswer !== "") {
        if (userAnswer === q.correct_answer) {
          score += q.marks ?? 4;
        } else {
          score -= q.negative_marks ?? 0;
        }
      }
      // Skipped → 0 change
    }

    // 8. Calculate totals, clamp score minimum to 0
    const totalMarks = quiz.total_marks || questions.reduce((s: number, q: any) => s + (q.marks ?? 4), 0);
    score = Math.max(0, score);
    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100 * 100) / 100 : 0;
    const passed = percentage >= (quiz.pass_percentage ?? 40);

    // 9. Insert quiz_attempts row via service client
    const { data: attempt, error: insertError } = await serviceClient
      .from("quiz_attempts")
      .insert({
        user_id: userId,
        quiz_id,
        submitted_at: new Date().toISOString(),
        score,
        percentage,
        passed,
        answers,
        time_taken_seconds: time_taken_seconds ?? 0,
      })
      .select("id")
      .single();

    if (insertError || !attempt) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save attempt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 10. Return attempt_id + score summary
    return new Response(
      JSON.stringify({
        attempt_id: attempt.id,
        score,
        percentage,
        passed,
        total_marks: totalMarks,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
