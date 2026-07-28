/**
 * Red-team regression: prove that a signed-in user CANNOT bypass paid enrollment.
 *
 * These tests only run when TEST_USER_EMAIL / TEST_USER_PASSWORD are set in the env
 * (typically CI). Locally they self-skip so `bunx vitest run` stays green.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = (import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL) as string;
const ANON = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;
const EMAIL = process.env.TEST_USER_EMAIL;
const PASS = process.env.TEST_USER_PASSWORD;
const PAID_COURSE_ID = Number(process.env.TEST_PAID_COURSE_ID ?? 0);

const runIf = EMAIL && PASS && PAID_COURSE_ID > 0 ? describe : describe.skip;

runIf("enrollment bypass — red team", () => {
  const supabase = createClient(URL, ANON);

  beforeAll(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: EMAIL!, password: PASS! });
    expect(error).toBeNull();
  });

  it("blocks direct INSERT into a paid course", async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("enrollments").insert({
      user_id: user!.id, course_id: PAID_COURSE_ID, status: "active",
    });
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/row-level security|policy/);
  });

  it("blocks status flip from cancelled -> active", async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: row } = await supabase.from("enrollments")
      .select("id, status").eq("user_id", user!.id).limit(1).maybeSingle();
    if (!row) return;
    const { error } = await supabase.from("enrollments")
      .update({ status: row.status === "active" ? "cancelled" : "active" })
      .eq("id", row.id);
    // Trigger blocks non-admin status change
    expect(error).not.toBeNull();
  });

  it("blocks course_id pivot on own enrollment", async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: row } = await supabase.from("enrollments")
      .select("id").eq("user_id", user!.id).limit(1).maybeSingle();
    if (!row) return;
    const { error } = await supabase.from("enrollments")
      .update({ course_id: PAID_COURSE_ID }).eq("id", row.id);
    expect(error).not.toBeNull();
  });

  it("blocks forged razorpay_payments insert", async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("razorpay_payments").insert({
      user_id: user!.id, course_id: PAID_COURSE_ID,
      razorpay_order_id: "order_fake_" + Date.now(),
      amount: 1, status: "completed",
    } as any);
    expect(error).not.toBeNull();
  });
});
