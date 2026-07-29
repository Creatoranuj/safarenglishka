// Authenticated proxy for the external Telegram-backed PDF storage project.
// Prevents the external anon key from being exposed in the client bundle,
// gates access behind a valid JWT from THIS project, and re-verifies that
// the caller is entitled to the specific `view_id` requested by resolving
// it back to a lesson (via `lesson_pdfs` / `lesson_attachments`) and
// checking enrollment / admin / teacher / free-course status.
//
// Request: POST { view_id: string }  (Authorization: Bearer <user JWT>)
// Response: application/pdf bytes on 200; JSON error otherwise.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildCorsHeaders } from "../_shared/cors.ts";

const TELEGRAM_SUPABASE_URL =
  Deno.env.get("TELEGRAM_STORAGE_URL") ??
  "https://hsvtagmckkfmniawflul.supabase.co";
const TELEGRAM_SUPABASE_KEY = Deno.env.get("TELEGRAM_STORAGE_ANON_KEY") ?? "";

const VIEW_ID_RE = /^[a-f0-9-]{20,64}$/i;

function jsonErr(status: number, message: string, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const CORS_HEADERS = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonErr(405, "Method not allowed", CORS_HEADERS);

  if (!TELEGRAM_SUPABASE_KEY) return jsonErr(500, "Storage proxy not configured", CORS_HEADERS);

  // Verify caller JWT against THIS project.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonErr(401, "Unauthorized", CORS_HEADERS);

  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authedClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authedClient.auth.getUser();
  if (!user) return jsonErr(401, "Unauthorized", CORS_HEADERS);

  let body: { view_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonErr(400, "Invalid JSON body", CORS_HEADERS);
  }
  const viewId = body.view_id?.trim();
  if (!viewId || !VIEW_ID_RE.test(viewId)) return jsonErr(400, "view_id required", CORS_HEADERS);

  // Enrollment / entitlement gate.
  // Look up the lesson that owns this view_id via a service-role client
  // (bypasses RLS on lesson_pdfs / lesson_attachments so we can find the
  // row regardless of whether the caller can normally read it), then
  // re-check that the caller is admin, the lesson's teacher, enrolled in
  // the owning course, or the lesson / course is free.
  const adminClient = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const viewPattern = `%/view/${viewId}%`;

  const [pdfsRes, attsRes] = await Promise.all([
    adminClient
      .from("lesson_pdfs")
      .select("lesson_id")
      .ilike("file_url", viewPattern)
      .limit(1),
    adminClient
      .from("lesson_attachments")
      .select("lesson_id")
      .ilike("file_url", viewPattern)
      .limit(1),
  ]);
  const lessonId: string | undefined =
    pdfsRes.data?.[0]?.lesson_id ?? attsRes.data?.[0]?.lesson_id;

  if (!lessonId) {
    // Unknown asset — never served by us; reject rather than proxy anonymously.
    return jsonErr(404, "Asset not registered", CORS_HEADERS);
  }

  const { data: lesson } = await adminClient
    .from("lessons")
    .select("course_id,is_free")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return jsonErr(404, "Lesson not found", CORS_HEADERS);

  let entitled = lesson.is_free === true;

  if (!entitled && lesson.course_id != null) {
    const { data: course } = await adminClient
      .from("courses")
      .select("price")
      .eq("id", lesson.course_id)
      .maybeSingle();
    if (course && (course.price == null || Number(course.price) === 0)) {
      entitled = true;
    }
  }

  if (!entitled) {
    const [{ data: isAdmin }, { data: isTeacher }] = await Promise.all([
      adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      adminClient.rpc("has_role", { _user_id: user.id, _role: "teacher" }),
    ]);
    if (isAdmin === true || isTeacher === true) entitled = true;
  }

  if (!entitled && lesson.course_id != null) {
    const { data: enroll } = await adminClient
      .from("enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_id", lesson.course_id)
      .eq("status", "active")
      .limit(1);
    if ((enroll?.length ?? 0) > 0) entitled = true;
  }

  if (!entitled) return jsonErr(403, "Not entitled to this document", CORS_HEADERS);

  const upstreamHeaders = {
    apikey: TELEGRAM_SUPABASE_KEY,
    Authorization: `Bearer ${TELEGRAM_SUPABASE_KEY}`,
  };

  // 1. Resolve view_id → file_id via upstream REST.
  const rowUrl = `${TELEGRAM_SUPABASE_URL}/rest/v1/pdf_documents?select=file_id,file_name&id=eq.${encodeURIComponent(viewId)}`;
  const rowResp = await fetch(rowUrl, { headers: upstreamHeaders });
  if (!rowResp.ok) return jsonErr(502, `Upstream metadata HTTP ${rowResp.status}`, CORS_HEADERS);
  const rows = (await rowResp.json()) as Array<{ file_id?: string; file_name?: string }>;
  const fileId = rows[0]?.file_id;
  const fileName = rows[0]?.file_name ?? "document.pdf";
  if (!fileId) return jsonErr(404, "Storage file not found", CORS_HEADERS);

  // 2. Fetch bytes via upstream edge function.
  const fileResp = await fetch(`${TELEGRAM_SUPABASE_URL}/functions/v1/telegram-get-file`, {
    method: "POST",
    headers: { ...upstreamHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!fileResp.ok) return jsonErr(502, `Upstream file HTTP ${fileResp.status}`, CORS_HEADERS);

  const contentType = fileResp.headers.get("content-type") ?? "application/pdf";
  return new Response(fileResp.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${fileName.replace(/[^\w.\-]+/g, "_")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});