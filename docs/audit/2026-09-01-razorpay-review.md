# Razorpay Review — Web + Capacitor (2026-09-01)

**Rating: 4.5 / 5** — architecture correct, secrets server-side, UPI-first on both
platforms; only gap is that no live/test key round-trip has been executed in this session.

## What was reviewed

| Layer | File | Verdict |
| --- | --- | --- |
| Platform split | `src/pages/BuyCourse.tsx:370` (`Capacitor.isNativePlatform()`) | ✅ correct — web SDK never loads on native |
| Web checkout | `src/utils/razorpay.ts` (`UPI_FIRST_CHECKOUT_CONFIG`, `sanitizeContact`) | ✅ UPI block first, `flows: [intent, collect, qr]` |
| Native checkout | `src/utils/razorpayNative.ts:216-248` | ✅ `upi: true` first key, EMI/paylater off, collect fallback kept |
| Order creation | `supabase/functions/create-razorpay-order` | ✅ server-only, returns `key_id`; no client-side order id |
| Verification | `supabase/functions/verify-razorpay-payment` | ✅ HMAC `order_id|payment_id` server-side |
| Webhook fallback | `supabase/functions/razorpay-webhook` | ✅ idempotent on `razorpay_payment_id` |
| Secrets | `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` | ✅ Supabase secrets, never in client bundle |
| Amounts | paise integer (web) / paise string (native) | ✅ matches plugin contract |
| Failure copy | `src/pages/PaymentCallback.tsx` | ✅ mentions webhook auto-enrollment |

## Deductions

- **-0.5 (verification)** — no test-mode transaction has been driven end-to-end from
  this session, so "works in prod" rests on code review, not a receipt.

## About generating a test key

Not required, and I'd advise against swapping keys on the live project: switching
`RAZORPAY_KEY_ID/SECRET` to test mode makes real student payments fail while the test
key is active. Preferred verification path:

1. Keep live keys in place.
2. Do one ₹1 real UPI purchase from an Android APK build and one from the web.
3. Confirm in Admin → Payments that both rows land with `status = captured`, and that
   the enrollment appears even if you kill the app right after paying (webhook path).

If you still want test-mode verification, create a **separate Razorpay test account**
and I'll wire it behind a `RAZORPAY_TEST_MODE` flag so live payments stay untouched.

## Wins

- Order + signature verification both server-side; frontend payload is never trusted.
- Webhook is a true safety net (idempotent), so a dropped callback still enrolls.
- Contact prefill shortens the UPI collect flow on both platforms.
- Sentry breadcrumbs carry `methods_enabled` / `has_contact_prefill` for triage.

Used the razorpay-payments skill.
