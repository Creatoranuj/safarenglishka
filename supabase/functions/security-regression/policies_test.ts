// Regression tests for critical RLS policies.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url =
  Deno.env.get("SUPABASE_URL") ??
  "https://cmbattmjwriiesibayfk.supabase.co";
const key =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYmF0dG1qd3JpaWVzaWJheWZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwODUxMTQsImV4cCI6MjA4NjY2MTExNH0.Wd_e8mzf4EFrXaD4rQCb9Zxv7too5GfOmpsn73yfuh0";

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
