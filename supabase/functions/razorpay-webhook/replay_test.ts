// Live test: webhook replay protection
// Sends the same payload twice; second call must return {status:'duplicate_event'}.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("razorpay-webhook replay protection returns duplicate_event on 2nd call", async () => {
  if (!SUPABASE_URL || !WEBHOOK_SECRET) {
    throw new Error(`Missing env: SUPABASE_URL=${!!SUPABASE_URL} RAZORPAY_WEBHOOK_SECRET=${!!WEBHOOK_SECRET}`);
  }

  const url = `${SUPABASE_URL}/functions/v1/razorpay-webhook`;
  const eventId = `test-replay-${Date.now()}`;
  const payload = {
    id: eventId,
    event: "payment.authorized", // non-captured → handler returns 'ignored' after replay check
    payload: { payment: { entity: { id: "pay_test", order_id: "order_test", amount: 100 } } },
  };
  const body = JSON.stringify(payload);
  const signature = await hmacSha256(WEBHOOK_SECRET, body);
  const headers = {
    "content-type": "application/json",
    "x-razorpay-signature": signature,
    "x-razorpay-event-id": eventId,
  };

  // First call → ignored
  const r1 = await fetch(url, { method: "POST", headers, body });
  const j1 = await r1.json();
  console.log("1st response:", r1.status, j1);
  assertEquals(r1.status, 200);
  assertEquals(j1.status, "ignored");

  // Second call (same event_id) → duplicate_event
  const r2 = await fetch(url, { method: "POST", headers, body });
  const j2 = await r2.json();
  console.log("2nd response:", r2.status, j2);
  assertEquals(r2.status, 200);
  assertEquals(j2.status, "duplicate_event");
});
