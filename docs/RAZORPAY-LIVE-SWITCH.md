# Razorpay: Test Mode → Live Mode Runbook

**Status: NOT SWITCHED.** The project is still on test keys. This document is the
step-by-step plan only. No live credential was requested, stored or used.

## 0. Pre-conditions

- [ ] Razorpay account KYC approved and settlement bank account verified.
- [ ] Latest backup artifact green (`supabase-backup.yml`).
- [ ] Payment tables clean of test rows (done in v1.4.9: `razorpay_payments`,
      `payment_events`, `payment_requests`, `webhook_events` all at 0).
- [ ] `razorpay-smoke.yml` workflow passing on test keys.

## 1. Where the keys live

The frontend never holds a Razorpay key. `create-razorpay-order` returns `key_id`
to the client at checkout time, so switching modes is a **secrets-only** change —
no code edit and no app rebuild is required.

| Secret | Used by | Test value | Live value |
|---|---|---|---|
| `RAZORPAY_KEY_ID` | `create-razorpay-order`, `create-subscription-order` | `rzp_test_…` | `rzp_live_…` |
| `RAZORPAY_KEY_SECRET` | `verify-razorpay-payment`, `verify-subscription-payment`, `initiate-refund` | test secret | live secret |
| `RAZORPAY_WEBHOOK_SECRET` | `razorpay-webhook`, `razorpay-refund-webhook` | test webhook secret | **new** live webhook secret |

## 2. Switch steps (in order)

1. **Razorpay dashboard → Settings → API Keys → Live mode → Generate Live Key.**
   Copy `key_id` and `key_secret` once; the secret is shown only at creation.
2. **Create the live webhooks** (Settings → Webhooks, Live mode):
   - `https://wegamscqtvqhxowlskfm.supabase.co/functions/v1/razorpay-webhook`
     events: `payment.captured`, `payment.failed`, `order.paid`
   - `https://wegamscqtvqhxowlskfm.supabase.co/functions/v1/razorpay-refund-webhook`
     events: `refund.created`, `refund.processed`, `refund.failed`
   Set a strong webhook secret and copy it.
3. **Update the three Supabase secrets** (Dashboard → Edge Functions → Secrets, or
   `supabase secrets set`). Update all three together — a mixed test/live pair makes
   every signature verification fail.
4. **Redeploy the seven payment functions** so they pick up the new secrets:
   `create-razorpay-order`, `create-subscription-order`, `verify-razorpay-payment`,
   `verify-subscription-payment`, `razorpay-webhook`, `razorpay-refund-webhook`,
   `initiate-refund`.
5. **Live smoke test with ₹1**: buy one cheap course from the real Android build
   (not the browser) so the native UPI intent path is exercised. Confirm the row lands
   in `razorpay_payments` with `status='completed'` and that `enrollments` gained
   exactly one row.
6. **Refund that ₹1** through `initiate-refund` and confirm `razorpay-refund-webhook`
   updates the row.
7. **Delete the ₹1 test rows** and re-run the backup workflow.

## 3. Rollback

Re-set the three secrets to the test values and redeploy the same seven functions.
No schema or client change is involved, so rollback takes under two minutes.

## 4. Do not

- Do not put any Razorpay key in `.env`, a `VITE_*` variable, or the Android build —
  the client receives `key_id` from the server at order time.
- Do not skip the webhook secret rotation; the test webhook secret will not validate
  live events.
- Do not test live payments in a browser preview — use the signed APK, because the
  native plugin path (UPI intent to PhonePe / Google Pay / Paytm) is what real users
  hit.
- Do not disable signature verification "temporarily" to debug a failure.
