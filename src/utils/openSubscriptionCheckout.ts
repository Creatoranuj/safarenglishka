// Unified subscription checkout entry point.
// Detects whether we are running inside a Capacitor native shell and routes
// to either the native Razorpay SDK (UPI intents → PhonePe/GPay/Paytm with
// no in-app browser) or the web Razorpay checkout.

import { supabase } from '@/integrations/supabase/client';

const API_BASE = "/api";
import { openRazorpayCheckout, type RazorpaySuccessResponse } from './razorpay';
import { openNativeRazorpayCheckout } from './razorpayNative';
import type { SubscriptionPlanSlug } from '@/data/subscriptionPlans';

const MERCHANT_NAME = 'Safar English Ka';

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

export const openSubscriptionCheckout = async (
  planSlug: SubscriptionPlanSlug,
  user: UserHint,
  callbacks: CheckoutCallbacks
): Promise<void> => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      callbacks.onError('Please login first');
      return;
    }

    // 1. Create order on server
    const orderRes = await fetch(`${API_BASE}/functions/v1/create-subscription-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan_slug: planSlug }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      callbacks.onError(orderData.error || 'Failed to create order');
      return;
    }

    const successHandler = async (response: RazorpaySuccessResponse) => {
      try {
        const verifyRes = await fetch(
          `${API_BASE}/functions/v1/verify-subscription-payment`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan_slug: planSlug,
            }),
          }
        );
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) {
          callbacks.onError(verifyData.error || 'Verification failed. Contact support.');
          return;
        }
        callbacks.onSuccess(verifyData.subscription);
      } catch (e: any) {
        callbacks.onError(e?.message || 'Verification failed');
      }
    };

    // 2. Open checkout — native sheet on Capacitor, web checkout in browser
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      try {
        const resp = await openNativeRazorpayCheckout({
          key: orderData.key_id,
          amount: orderData.amount,
          currency: orderData.currency,
          name: MERCHANT_NAME,
          description: orderData.plan_name,
          order_id: orderData.order_id,
          prefill: { name: user.name, email: user.email, contact: user.contact },
          theme: { color: '#F97316' },
        });
        await successHandler(resp);
      } catch (e: any) {
        if (e?.message?.includes('Payment did not complete')) {
          callbacks.onDismiss?.();
        } else {
          callbacks.onError(e?.message || 'Payment cancelled');
        }
      }
      return;
    }

    // Web path
    await openRazorpayCheckout({
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      name: MERCHANT_NAME,
      description: orderData.plan_name,
      order_id: orderData.order_id,
      prefill: { name: user.name, email: user.email, contact: user.contact },
      theme: { color: '#F97316' },
      handler: successHandler,
      modal: { ondismiss: () => callbacks.onDismiss?.() },
    });
  } catch (e: any) {
    callbacks.onError(e?.message || 'Could not start checkout');
  }
};

export const startSubscriptionTrial = async (
  planSlug: SubscriptionPlanSlug
): Promise<{ ok: true; subscription: any } | { ok: false; error: string }> => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { ok: false, error: 'Please login first' };

    const res = await fetch(`${API_BASE}/functions/v1/start-subscription-trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan_slug: planSlug }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Could not start trial' };
    return { ok: true, subscription: data.subscription };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
};
