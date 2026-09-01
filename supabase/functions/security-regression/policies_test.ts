// Regression tests for critical RLS policies.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Credentials come from the environment only. A committed project URL + anon
// JWT is a leaked credential, and it pointed at the wrong project besides.
const url = Deno.env.get("SUPABASE_URL");
const key =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY");

if (!url || !key) {
  throw new Error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) before running the RLS regression tests.",
  );
}

Deno.test("RLS regression: realtime + comment-images policies are locked down", async () => {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("audit_security_policies");
  if (error) throw error;
  if (data && data.length > 0) {
    console.error("Security regressions:", JSON.stringify(data, null, 2));
  }
  assertEquals(data?.length ?? 0, 0, "Expected zero RLS regressions");
});
