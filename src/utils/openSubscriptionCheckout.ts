// Unified subscription checkout entry point.
// Detects whether we are running inside a Capacitor native shell and routes
// to either the native Razorpay SDK (UPI intents → PhonePe/GPay/Paytm with
// no in-app browser) or the web Razorpay checkout.

import { openRazorpayCheckout, formatRazorpayError, type RazorpaySuccessResponse } from "./razorpay";
import {
  openNativeRazorpayCheckout,
  RazorpayCancelledError,
} from "./razorpayNative";
import {
  invokePaymentFunction,
  hapticPaymentSuccess,
  hapticPaymentError,
} from "./paymentApi";
import type { SubscriptionPlanSlug } from "@/data/subscriptionPlans";

const MERCHANT_NAME = "Safar English";
const BRAND_COLOR = "#F97316";

interface CheckoutCallbacks {
  onSuccess: (sub: { id: string; plan_slug: string; current_period_end: string }) => void;
  onError: (message: string) => void;
  onDismiss?: () => void;
}

interface UserHint {
  name?: string;
  email?: string;
  contact?: string;
}

interface OrderResponse {
  key_id: string;
  amount: number;
  currency: string;
  order_id: string;
  plan_name: string;
}

export const openSubscriptionCheckout = async (
  planSlug: SubscriptionPlanSlug,
  user: UserHint,
  callbacks: CheckoutCallbacks
): Promise<void> => {
  // 1. Create order on server (works on web + Capacitor APK).
  let orderData: OrderResponse;
  try {
    orderData = await invokePaymentFunction<OrderResponse>(
      "create-subscription-order",
      { plan_slug: planSlug }
    );
  } catch (e: any) {
    void hapticPaymentError();
    callbacks.onError(e?.message || "Could not start checkout");
    return;
  }

  const verify = async (response: RazorpaySuccessResponse) => {
    try {
      const verifyData = await invokePaymentFunction<{ subscription: any }>(
        "verify-subscription-payment",
        {
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          plan_slug: planSlug,
        }
      );
      void hapticPaymentSuccess();
      callbacks.onSuccess(verifyData.subscription);
    } catch (e: any) {
      void hapticPaymentError();
      callbacks.onError(
        e?.message ||
          "Verification failed. Your payment is safe — contact support if it persists."
      );
    }
  };

  const sharedOpts = {
    key: orderData.key_id,
    amount: orderData.amount,
    currency: orderData.currency,
    name: MERCHANT_NAME,
    description: orderData.plan_name,
    order_id: orderData.order_id,
    prefill: { name: user.name, email: user.email, contact: user.contact },
    theme: { color: BRAND_COLOR },
  };

  // 2. Open checkout — native sheet on Capacitor, web checkout in browser.
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    try {
      const resp = await openNativeRazorpayCheckout(sharedOpts);
      await verify(resp);
    } catch (e: any) {
      if (e instanceof RazorpayCancelledError) {
        callbacks.onDismiss?.();
      } else {
        void hapticPaymentError();
        callbacks.onError(e?.message || "Payment failed");
      }
    }
    return;
  }

  // Web path.
  try {
    await openRazorpayCheckout({
      ...sharedOpts,
      handler: verify,
      onFailure: (err) => {
        void hapticPaymentError();
        callbacks.onError(formatRazorpayError(err));
      },
      modal: { ondismiss: () => callbacks.onDismiss?.() },
    });
  } catch (e: any) {
    callbacks.onError(e?.message || "Could not open checkout");
  }
};

export const startSubscriptionTrial = async (
  planSlug: SubscriptionPlanSlug
): Promise<{ ok: true; subscription: any } | { ok: false; error: string }> => {
  try {
    const data = await invokePaymentFunction<{ subscription: any }>(
      "start-subscription-trial",
      { plan_slug: planSlug }
    );
    return { ok: true, subscription: data.subscription };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not start trial" };
  }
};
