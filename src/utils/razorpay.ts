import { reportError, addBreadcrumb } from "../lib/sentry";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
  callback_url?: string;
  redirect?: boolean;
  /** Called when Razorpay fires `payment.failed`. */
  onFailure?: (err: RazorpayPaymentError) => void;
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayPaymentError {
  code?: string;
  description?: string;
  source?: string;
  step?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Human-friendly copy for Razorpay's opaque error shapes. Razorpay often
 * returns `description: "undefined"` (literal string) with no user-visible
 * message — that's what triggered the customer-facing bug report. Map the
 * common (step, reason) combos to actionable messages instead.
 */
export function formatRazorpayError(err: RazorpayPaymentError | undefined | null): string {
  if (!err) return "Payment failed. Please try again.";
  const step = (err.step || "").toLowerCase();
  const reason = (err.reason || "").toLowerCase();
  const source = (err.source || "").toLowerCase();
  const code = (err.code || "").toUpperCase();
  const desc = err.description && err.description !== "undefined" ? err.description : "";

  if (step === "payment_authentication") {
    // Card/UPI OTP or 3DS challenge failed on the bank side. This is NOT
    // a merchant-side config issue — the order + key are valid or Razorpay
    // would have refused to open. The user needs to retry with a different
    // instrument or complete the OTP correctly.
    return desc
      || "Bank could not verify your payment (OTP / 3-D Secure). Please retry, or use UPI / a different card.";
  }
  if (reason === "payment_cancelled") return "Payment cancelled. No amount was charged.";
  if (reason === "network_error")     return "Network dropped during payment. Check your connection and retry.";
  if (reason === "gateway_error")     return "Your bank's gateway is down. Please retry in a minute or use a different method.";
  if (reason === "international_transaction_not_allowed")
    return "International cards are not supported for this course. Please use an Indian card or UPI.";
  if (reason === "invalid_otp")       return "Wrong OTP. Please retry and enter the OTP from your bank SMS.";
  if (reason === "payment_timeout")   return "Payment timed out. Please retry.";

  // Razorpay's most common opaque failure: BAD_REQUEST_ERROR with
  // `description: "undefined"` and no reason. Attributable to the customer
  // (source=customer) — usually a mistyped OTP / UPI PIN or an authorization
  // that the bank refused without a specific code.
  if (code === "BAD_REQUEST_ERROR" || reason === "payment_error" || source === "customer") {
    return desc
      || "Payment could not be completed. Please retry, or try UPI / a different card.";
  }

  return desc || `Payment failed (${err.reason || err.code || "unknown reason"}). Please try again.`;
}

export const openRazorpayCheckout = async (options: RazorpayOptions): Promise<void> => {
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    addBreadcrumb('payment', 'razorpay:sdk-load-failed', { order_id: options.order_id });
    const err = new Error('Failed to load Razorpay checkout. Check your internet connection.');
    reportError(err, { surface: 'razorpay.load', order_id: options.order_id });
    throw err;
  }

  if (!window.Razorpay) {
    const err = new Error('Razorpay SDK not available. Please try again or use a different browser.');
    reportError(err, { surface: 'razorpay.load', reason: 'sdk-missing-after-load', order_id: options.order_id });
    throw err;
  }

  const { onFailure, ...rzpOptions } = options;
  const rzp = new window.Razorpay(rzpOptions);

  // Route Razorpay's async payment.failed event to the caller so the UI can
  // show a real message instead of a generic toast. Also forwarded to Sentry
  // with full context so we can diagnose recurring key/mode issues.
  rzp.on('payment.failed', (response: { error?: RazorpayPaymentError }) => {
    const err = response?.error;
    reportError(err ?? new Error('Razorpay payment failed'), {
      surface: 'razorpay.payment_failed',
      step: err?.step,
      reason: err?.reason,
      code: err?.code,
      source: err?.source,
    });
    try { onFailure?.(err ?? {}); } catch { /* ignore */ }
  });

  addBreadcrumb('payment', 'razorpay:open', { order_id: options.order_id, mode: 'web' });
  rzp.open();
};
