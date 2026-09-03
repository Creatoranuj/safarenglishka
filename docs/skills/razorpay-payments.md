# Skill: razorpay-payments

**Goal:** money paths are tamper-proof and UPI works inside the Capacitor app.

## Rules
1. Order creation is server-side only; the amount comes from the course row, never from the client.
2. Verify `razorpay_signature` with HMAC-SHA256 in the shared helper (`supabase/functions/_shared/razorpay.ts`) using a timing-safe compare.
3. Idempotency on `razorpay_payment_id`; a replayed webhook must not double-enroll.
4. Enrollment is written only after verification succeeds, in the same transaction as the payment record.
5. Test keys (`rzp_test_`) in dev; live keys only as Supabase edge secrets — never in the repo.
6. Capacitor UPI: intent flow must resolve PhonePe / GPay / Paytm; keep the app-package allowlist and the return-to-app deep link working after every plugin bump.
7. Webhooks live under a public route that verifies the Razorpay signature before reading the body.

## Repo anchors
`supabase/functions/_shared/razorpay.ts`, `supabase/functions/verify-payment/`, `src/lib/payments/`
