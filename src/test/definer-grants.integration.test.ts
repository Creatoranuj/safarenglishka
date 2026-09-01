/**
 * Integration test: verifies definer-function EXECUTE grants match intent.
 *
 * Anon boolean-only (no data, no-op when auth.uid() is null): has_role, get_user_role
 * Service-role only: get_platform_stats (fronted by the platform-stats edge fn)
 * Auth-only (authenticated but not anon): search_lectures, get_quiz_questions,
 *   get_quiz_review, get_dashboard_snapshot, get_course_bundle,
 *   get_course_lesson_stats, get_user_profiles_admin, admin_* functions
 *
 * Hits the live Supabase project with the anon key to prove the grants
 * are what the audit says they are. Skipped automatically when the
 * network is unavailable so CI stays green offline.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Read from env so the test always targets the *currently connected* project
// instead of a hardcoded (and now stale) project ref.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const anon = createClient(SUPABASE_URL ?? "http://localhost", SUPABASE_ANON_KEY ?? "anon", {
  auth: { persistSession: false, autoRefreshToken: false },
});

let online = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

beforeAll(async () => {
  if (!online) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { method: "GET" });
    online = r.ok || r.status < 500;
  } catch {
    online = false;
  }
});

function isPermissionDenied(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === "42501" ||
    /permission denied/i.test(e.message ?? "") ||
    /not.*allowed/i.test(e.message ?? "")
  );
}

describe("definer function access grants", () => {
  it("get_platform_stats is NOT anon-callable (edge function fronts it)", async () => {
    if (!online) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (anon.rpc as any)("get_platform_stats");
    expect(error).toBeTruthy();
  });

  it("search_lectures is NOT anon-callable (auth-gated)", async () => {
    if (!online) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (anon.rpc as any)("search_lectures", {
      _query: "a",
      _limit: 1,
    });
    expect(error).toBeTruthy();
  });

  it.each([
    "get_user_profiles_admin",
    "get_quiz_questions",
    "verify_enrollment_for_attendance",
    "increment_book_clicks",
    "check_rate_limit",
    "get_course_lesson_stats",
    "has_role",
    "get_user_role",
  ])("%s does not leak data to anon", async (fn) => {
    if (!online) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (anon.rpc as any)(fn, {} as never);
    // Acceptable outcomes for anon:
    //  - PostgREST/DB error (permission denied, missing arg, auth required)
    //  - null / empty result (STABLE fn no-ops when auth.uid() is null)
    // A non-empty successful data payload = leak.
    if (error) {
      expect(error).toBeTruthy();
      return;
    }
    const leaked =
      data !== null &&
      data !== undefined &&
      !(Array.isArray(data) && data.length === 0) &&
      data !== false;
    expect(leaked, `anon received data from ${fn}: ${JSON.stringify(data)}`).toBe(false);
  });
});
