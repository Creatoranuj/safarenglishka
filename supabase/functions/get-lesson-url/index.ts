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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { lesson_id } = await req.json();
    if (!lesson_id) {
      return new Response(JSON.stringify({ error: "lesson_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lesson, error: lessonError } = await serviceClient
      .from("lessons")
      .select("id, title, video_url, class_pdf_url, is_locked, course_id, lecture_type")
      .eq("id", lesson_id)
      .single();

    if (lessonError) {
      console.error("Lesson query error:", { lesson_id, user_id: user.id, code: lessonError.code, message: lessonError.message });
      if (lessonError.code === "42501") {
        return new Response(JSON.stringify({ error: "Server configuration error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Lesson not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!lesson) {
      return new Response(JSON.stringify({ error: "Lesson not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check user role (admins/teachers always get access)
    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "teacher"])
      .maybeSingle();

    const isAdminOrTeacher = !!roleData;

    // If lesson is not locked, allow access to all authenticated users
    if (!lesson.is_locked || isAdminOrTeacher) {
      const resolved = await resolveUrls(serviceClient, lesson.video_url, lesson.class_pdf_url);
      return new Response(
        JSON.stringify({
          video_url: resolved.video_url,
          class_pdf_url: resolved.class_pdf_url,
          lecture_type: lesson.lecture_type,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Lesson is locked — check enrollment
    const { data: enrollment } = await serviceClient
      .from("enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_id", lesson.course_id)
      .eq("status", "active")
      .maybeSingle();

    if (!enrollment) {
      return new Response(
        JSON.stringify({ error: "Purchase required to access this lesson" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Enrolled user — return URLs
    const resolved = await resolveUrls(serviceClient, lesson.video_url, lesson.class_pdf_url);
    return new Response(
      JSON.stringify({
        video_url: resolved.video_url,
        class_pdf_url: resolved.class_pdf_url,
        lecture_type: lesson.lecture_type,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("get-lesson-url error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Resolve storage:// paths to signed URLs.
 * Format: storage://bucket-name/path/to/file.mp4
 * Regular URLs pass through unchanged.
 */
async function resolveUrls(
  serviceClient: ReturnType<typeof createClient>,
  videoUrl: string | null,
  classPdfUrl: string | null
): Promise<{ video_url: string | null; class_pdf_url: string | null }> {
  return {
    video_url: videoUrl ? await resolveStoragePath(serviceClient, videoUrl) : null,
    class_pdf_url: classPdfUrl ? await resolveStoragePath(serviceClient, classPdfUrl) : null,
  };
}

async function resolveStoragePath(
  serviceClient: ReturnType<typeof createClient>,
  url: string
): Promise<string> {
  if (!url.startsWith("storage://")) {
    return url;
  }

  // storage://course-videos/lessons/abc.mp4
  const withoutPrefix = url.slice("storage://".length); // "course-videos/lessons/abc.mp4"
  const slashIdx = withoutPrefix.indexOf("/");
  if (slashIdx === -1) {
    console.error("Invalid storage path (no file path):", url);
    return url;
  }

  const bucket = withoutPrefix.slice(0, slashIdx);
  const filePath = withoutPrefix.slice(slashIdx + 1);

  const { data, error } = await serviceClient.storage
    .from(bucket)
    .createSignedUrl(filePath, 3600); // 1 hour expiry

  if (error) {
    console.error("Failed to create signed URL:", { bucket, filePath, error: error.message });
    return url; // Return raw path as fallback
  }

  return data.signedUrl;
}
