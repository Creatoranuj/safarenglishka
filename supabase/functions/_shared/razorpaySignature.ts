/**
 * Razorpay signature verification — single source of truth.
 *
 * Modelled on Razorpay's own official SDK helper
 * (razorpay/razorpay-node → lib/utils/razorpay-utils.js:
 *  `validateWebhookSignature`, `validatePaymentVerification`).
 * We deliberately mirror their API shape so the semantics are auditable
 * against upstream instead of being re-invented per edge function.
 *
 * Why this file exists: hmacSha256 + timingSafeEqual were copy-pasted into
 * four functions (verify-razorpay-payment, verify-subscription-payment,
 * razorpay-webhook, razorpay-refund-webhook). Four copies means a fix to one
 * silently leaves three vulnerable. Import from here only.
 *
 * SECURITY RULES (do not relax):
 *  - Webhook HMAC is computed over the RAW request body text, never over a
 *    re-serialised JSON object — key order/whitespace changes break the HMAC.
 *  - Comparison is constant-time. A plain `===` on a hex digest leaks the
 *    digest byte-by-byte through response timing.
 *  - Payment verification payload is `order_id|payment_id`.
 *  - Subscription verification payload is `payment_id|subscription_id`
 *    (Razorpay reverses the order for subscriptions — upstream SDK does the
 *    same; getting this backwards silently rejects every real payment).
 */

const encoder = new TextEncoder();

/** Lowercase hex HMAC-SHA256, matching Razorpay's `crypto` digest('hex'). */
export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Normalisation is case/whitespace only: a hex digest is the same value
 * whether it arrives as `AB` or `ab`, so lowercasing cannot widen what is
 * accepted — it only removes a false-negative class when a proxy or client
 * uppercases the header. The length check short-circuits before the loop,
 * which is safe because digest length is not secret (always 64 chars).
 */
export function secureCompareHex(a: string, b: string): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  if (x.length !== y.length || x.length === 0) return false;
  const bufA = encoder.encode(x);
  const bufB = encoder.encode(y);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) result |= bufA[i] ^ bufB[i];
  return result === 0;
}

/** Razorpay `validateWebhookSignature(body, signature, secret)`. */
export async function validateWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret || !rawBody) return false;
  return secureCompareHex(await hmacSha256Hex(secret, rawBody), signature);
}

/** Razorpay `validatePaymentVerification({order_id, payment_id}, sig, secret)`. */
export async function validatePaymentVerification(
  params: { order_id: string; payment_id: string },
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret || !params?.order_id || !params?.payment_id) return false;
  const payload = `${params.order_id}|${params.payment_id}`;
  return secureCompareHex(await hmacSha256Hex(secret, payload), signature);
}

/**
 * Razorpay subscription verification.
 * NOTE the reversed order: `payment_id|subscription_id`.
 */
export async function validateSubscriptionVerification(
  params: { subscription_id: string; payment_id: string },
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret || !params?.subscription_id || !params?.payment_id) return false;
  const payload = `${params.payment_id}|${params.subscription_id}`;
  return secureCompareHex(await hmacSha256Hex(secret, payload), signature);
}
