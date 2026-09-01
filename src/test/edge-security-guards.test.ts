import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-level contracts for backend security fixes. They cannot be exercised
 * from Vitest (Deno runtime, live network), so the guard is that the shape of
 * the code does not regress.
 */
const fnDir = resolve(__dirname, "../../supabase/functions");
const read = (p: string) => readFileSync(resolve(fnDir, p), "utf8");

describe("edge function security contracts", () => {
  it("RLS regression test carries no committed project URL or JWT", () => {
    const src = read("security-regression/policies_test.ts");
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(src).not.toMatch(/https:\/\/[a-z0-9]{20}\.supabase\.co/);
    expect(src).toContain('Deno.env.get("SUPABASE_URL")');
  });

  it("chatbot rate limiter fails closed", () => {
    const src = read("chatbot/index.ts");
    const idx = src.indexOf("rate limit check failed");
    expect(idx).toBeGreaterThan(-1);
    // The catch block must deny, not allow, when the counter is unreadable.
    expect(src.slice(idx, idx + 200)).toContain("return true;");
  });

  it("discovered video instances are SSRF-filtered", () => {
    const src = read("get-video-stream/index.ts");
    expect(src).toContain("function isSafeInstanceOrigin");
    expect(src).toContain("isSafeInstanceOrigin(o)");
    expect(src).not.toContain(".filter(Boolean) as string[];");
  });
});
