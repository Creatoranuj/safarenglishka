import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  hmacSha256Hex,
  secureCompareHex,
  validateWebhookSignature,
  validatePaymentVerification,
  validateSubscriptionVerification,
} from "../../supabase/functions/_shared/razorpaySignature";

const SECRET = "test_secret_key";

describe("razorpaySignature — Razorpay SDK parity", () => {
  it("produces a 64-char lowercase hex digest", async () => {
    const d = await hmacSha256Hex(SECRET, "order_1|pay_1");
    expect(d).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts a correct payment signature (order_id|payment_id)", async () => {
    const sig = await hmacSha256Hex(SECRET, "order_1|pay_1");
    await expect(
      validatePaymentVerification({ order_id: "order_1", payment_id: "pay_1" }, sig, SECRET),
    ).resolves.toBe(true);
  });

  it("rejects a payment signature built from a different order", async () => {
    const sig = await hmacSha256Hex(SECRET, "order_OTHER|pay_1");
    await expect(
      validatePaymentVerification({ order_id: "order_1", payment_id: "pay_1" }, sig, SECRET),
    ).resolves.toBe(false);
  });

  it("uses the reversed payload for subscriptions (payment_id|subscription_id)", async () => {
    const correct = await hmacSha256Hex(SECRET, "pay_1|sub_1");
    const reversed = await hmacSha256Hex(SECRET, "sub_1|pay_1");
    const args = { subscription_id: "sub_1", payment_id: "pay_1" };
    await expect(validateSubscriptionVerification(args, correct, SECRET)).resolves.toBe(true);
    await expect(validateSubscriptionVerification(args, reversed, SECRET)).resolves.toBe(false);
  });

  it("verifies a webhook over the raw body text, not a re-serialised object", async () => {
    const raw = '{\n  "event": "payment.captured",\n  "amount": 49900\n}';
    const sig = await hmacSha256Hex(SECRET, raw);
    await expect(validateWebhookSignature(raw, sig, SECRET)).resolves.toBe(true);
    // Round-tripping through JSON drops the original whitespace, so the HMAC
    // no longer matches — this is exactly why the handlers must read req.text().
    await expect(
      validateWebhookSignature(JSON.stringify(JSON.parse(raw)), sig, SECRET),
    ).resolves.toBe(false);
  });

  it("rejects empty / missing signatures and secrets", async () => {
    await expect(validateWebhookSignature("{}", null, SECRET)).resolves.toBe(false);
    await expect(validateWebhookSignature("{}", "abc", "")).resolves.toBe(false);
    expect(secureCompareHex("", "")).toBe(false);
  });

  it("is case-insensitive on hex but not value-insensitive", async () => {
    const sig = await hmacSha256Hex(SECRET, "raw");
    expect(secureCompareHex(sig, sig.toUpperCase())).toBe(true);
    expect(secureCompareHex(sig, sig.replace(/.$/, (c) => (c === "0" ? "1" : "0")))).toBe(false);
  });
});

describe("no duplicated signature primitives remain in payment functions", () => {
  const files = [
    "supabase/functions/verify-razorpay-payment/index.ts",
    "supabase/functions/verify-subscription-payment/index.ts",
    "supabase/functions/razorpay-webhook/index.ts",
    "supabase/functions/razorpay-refund-webhook/index.ts",
  ];
  it.each(files)("%s imports the shared helper and defines no local copy", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toContain("_shared/razorpaySignature.ts");
    expect(src).not.toMatch(/function\s+timingSafeEqual/);
    expect(src).not.toMatch(/function\s+hmacSha256/);
  });
});
