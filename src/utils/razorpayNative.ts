// Native Razorpay checkout wrapper (Capacitor Android/iOS).
// Uses the official `capacitor-razorpay` plugin which opens the native
// Razorpay SDK sheet — this is what allows UPI intents to launch PhonePe,
// Google Pay and Paytm directly without going through an in-app browser.
import { addBreadcrumb } from "../lib/sentry";

export interface NativeRazorpayOptions {
  key: string;
  amount: number; // in paise
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export class RazorpayCancelledError extends Error {
  constructor() {
    super("Payment cancelled");
    this.name = "RazorpayCancelledError";
  }
}

/**
 * Structured Razorpay failure raised from the native plugin. Carries the
 * same fields the web `payment.failed` event exposes, so callers can pass
 * this straight to `formatRazorpayError()` instead of regexing on `.message`.
 */
export class RazorpayNativeError extends Error {
  code?: string;
  description?: string;
  source?: string;
  step?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  constructor(fields: {
    code?: string; description?: string; source?: string;
    step?: string; reason?: string; metadata?: Record<string, unknown>;
  }, fallbackMessage: string) {
    super(fields.description && fields.description !== "undefined"
      ? fields.description
      : fallbackMessage);
    this.name = "RazorpayNativeError";
    this.code = fields.code;
    this.description = fields.description;
    this.source = fields.source;
    this.step = fields.step;
    this.reason = fields.reason;
    this.metadata = fields.metadata;
  }
}

const CANCEL_HINTS = [
  "cancel",
  "dismiss",
  "back_pressed",
  "user closed",
  "payment did not complete",
];

const looksLikeCancel = (msg: string): boolean => {
  const lower = msg.toLowerCase();
  return CANCEL_HINTS.some((h) => lower.includes(h));
};

/**
 * Best-effort extraction of Razorpay's structured error from whatever shape
 * the plugin throws. Different plugin versions surface the failure as:
 *   - a plain string message
 *   - `{ code, description, ... }` on the error object
 *   - a JSON-stringified `{ error: { code, description, step, reason } }`
 * We normalize all of them to the same field set.
 */
const extractRazorpayError = (e: any): {
  code?: string; description?: string; source?: string;
  step?: string; reason?: string; metadata?: Record<string, unknown>;
} => {
  if (!e) return {};
  // Direct fields on the thrown value.
  const direct: any = {
    code: e.code, description: e.description, source: e.source,
    step: e.step, reason: e.reason, metadata: e.metadata,
  };
  if (direct.step || direct.reason || direct.description) return direct;

  // Try to parse a JSON string message (older capacitor-razorpay versions).
  const raw = typeof e === "string" ? e : (e.message || e.errorMessage || "");
  if (raw && (raw.startsWith("{") || raw.includes('"error"'))) {
    try {
      const parsed = JSON.parse(raw);
      const err = parsed?.error ?? parsed;
      return {
        code: err?.code, description: err?.description, source: err?.source,
        step: err?.step, reason: err?.reason, metadata: err?.metadata,
      };
    } catch { /* fall through */ }
  }
  return { description: raw || undefined };
};

/**
 * Opens the native Razorpay checkout sheet and resolves with the success
 * payload. Throws {@link RazorpayCancelledError} when the user dismisses the
 * sheet, and a regular Error for real failures (declined card, signature
 * mismatch, etc.) so callers can show the right UX.
 */
export const openNativeRazorpayCheckout = async (
  options: NativeRazorpayOptions
): Promise<RazorpaySuccessResponse> => {
  let Checkout: any;
  try {
    ({ Checkout } = await import("capacitor-razorpay"));
  } catch {
    throw new Error(
      "Native payment module is missing. Please update the app from the Play Store."
    );
  }

  // The native SDK expects amount as a string of paise.
  const payload: any = { ...options, amount: String(options.amount) };

  let result: any;
  try {
    addBreadcrumb('payment', 'razorpay:open', { order_id: options.order_id, mode: 'native' });
    result = await Checkout.open(payload);
  } catch (e: any) {
    const msg = e?.message || e?.errorMessage || String(e ?? "");
    if (looksLikeCancel(msg)) throw new RazorpayCancelledError();
    // Preserve Razorpay's structured error (step / reason / code) so the
    // caller can render an actionable message instead of "undefined".
    const fields = extractRazorpayError(e);
    throw new RazorpayNativeError(fields, msg || "Payment failed");
  }

  // The plugin returns `{ response: string | object }` — newer versions
  // already parse the JSON, older versions return a stringified payload.
  let parsed: any = result?.response ?? result;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      // Some plugin versions return the payment id directly as a string —
      // surface it as razorpay_payment_id so callers don't crash, but the
      // signature won't be available. The server-side verifier will reject
      // it and surface a friendly error.
      parsed = { razorpay_payment_id: parsed };
    }
  }

  if (!parsed?.razorpay_payment_id) {
    throw new RazorpayCancelledError();
  }

  return {
    razorpay_payment_id: parsed.razorpay_payment_id,
    razorpay_order_id: parsed.razorpay_order_id ?? options.order_id,
    razorpay_signature: parsed.razorpay_signature,
  };
};
