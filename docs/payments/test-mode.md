# Razorpay Test Mode — Safar English

How to run the payment flow end-to-end against Razorpay **test** credentials,
on web and inside the Android APK. No secret values live in this repo.

## 1. Where keys go (never in code, never in chat)

| Key | Where it belongs | Used by |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` (`rzp_test_...`) | Supabase project secrets | `create-razorpay-order`, `create-subscription-order` (returned to the client as `key_id`) |
| `RAZORPAY_KEY_SECRET` | Supabase project secrets | order creation + `verify-razorpay-payment` HMAC |
| `RAZORPAY_WEBHOOK_SECRET` | Supabase project secrets + Razorpay dashboard webhook config | `razorpay-webhook`, `razorpay-refund-webhook` |

The frontend never holds a Razorpay key. `create-razorpay-order` returns the
`key_id` to use for that order, so switching test ↔ live is a **secret change
only** — no rebuild, no APK re-release.

Set them with:

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=xxx
```

CI (`.github/workflows/razorpay-smoke.yml`) reads the same names from GitHub
repository secrets.

## 2. Test-mode checklist

1. Razorpay dashboard → toggle **Test Mode** → Settings → API Keys → generate
   `rzp_test_...` pair.
2. Settings → Webhooks → add
   `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`
   with events `payment.captured`, `payment.failed`, `order.paid`, and the
   refund webhook for `refund.processed`. Copy the signing secret into
   `RAZORPAY_WEBHOOK_SECRET`.
3. Settings → Configuration → enable **UPI**, Cards, Netbanking, Wallets in
   test mode. The checkout only shows methods enabled on the dashboard —
   `UPI_FIRST_CHECKOUT_CONFIG` in `src/utils/razorpay.ts` can order them, not
   create them.

## 3. Test instruments

| Method | Value | Result |
| --- | --- | --- |
| Card | `4111 1111 1111 1111`, any future expiry, CVV `123` | success |
| Card (failure) | `4000 0000 0000 0002` | failed payment path |
| UPI (web/test) | `success@razorpay` | captured |
| UPI (web/test) | `failure@razorpay` | failed |
| Netbanking | any bank → "Success" on the mock page | captured |

Test mode does **not** launch real PhonePe/GPay/Paytm intents — those only fire
against live keys on a real device with the app installed. To verify intent
wiring without money, see §5.

## 4. Flow to exercise

```text
Buy course → create-razorpay-order (server) → checkout
   ├─ web        → openRazorpayCheckout        (src/utils/razorpay.ts)
   └─ native APK → openNativeRazorpayCheckout  (src/utils/razorpayNative.ts)
        └─ success → verify-razorpay-payment  → enrollment row
        └─ webhook → razorpay-webhook         → enrollment row (idempotent)
```

Enrollment must appear even if you kill the app right after paying — that is
the webhook path. Test it: pay, force-stop the app before the callback screen,
reopen, and confirm the course is unlocked.

## 5. Verifying UPI intent on the APK without a live payment

UPI intent apps are discovered through Android 11+ package visibility. The
`<queries>` block in `android/app/src/main/AndroidManifest.xml` lists the
`upi://`, `phonepe://`, `gpay://`, `tez://`, `paytmmp://` schemes plus explicit
packages for GPay, PhonePe, Paytm, BHIM, Amazon Pay, CRED, WhatsApp, Freecharge,
MobiKwik and the major bank UPI apps.

To confirm on a device:

```bash
adb shell dumpsys package com.safarenglishka.app | grep -A5 queries
adb logcat | grep -i "razorpay\|upi_intent"
```

`openNativeRazorpayCheckout` logs the exact `method` map it hands the native
SDK (`methods_enabled`, `has_upi`) — if the UPI tab is empty, that log line
tells you whether the app or the dashboard dropped it.

## 6. Going live

1. Swap the three Supabase secrets to `rzp_live_...` values.
2. Re-point the dashboard webhook to the same URL under live mode and update
   `RAZORPAY_WEBHOOK_SECRET`.
3. Nothing in the APK changes — `key_id` arrives from the server per order.
