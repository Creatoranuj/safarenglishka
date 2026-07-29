## Goal
Make the APK always use the currently configured Supabase Razorpay key (test or live) and stop reusing stale pending orders created under an older key.

## Confirmed from project reads
- `BuyCourse.tsx` sends a persisted `idempotency_key` for each user/course checkout attempt.
- `create-razorpay-order` currently reuses any pending `razorpay_payments` row matching that key, then returns the current `RAZORPAY_KEY_ID`.
- This can pair an old live-mode `order_id` with the new test-mode `key_id` after secrets are switched, especially in APK where storage persists across builds/sessions.
- Runtime Razorpay keys are in Supabase secrets, not GitHub Actions secrets; secret names exist: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

## Implementation plan
1. **Make order reuse key-mode safe**
   - In `supabase/functions/create-razorpay-order/index.ts`, read and validate `RAZORPAY_KEY_ID` before idempotency reuse.
   - When an existing pending order is found, verify that the saved `razorpay_order_id` is visible through the currently active Razorpay key using Razorpay's order fetch API.
   - If it is not visible, skip reuse and create a fresh order using the current Supabase key.
   - If Razorpay is temporarily unreachable during the reuse check, return a retryable 503 rather than opening checkout with a potentially mismatched key/order.

2. **Prevent stale native checkout attempts**
   - Treat old pending orders as stale after a short window (10 minutes) and create a fresh order.
   - Log skipped reuse events into `payment_events` for debugging without exposing secrets.

3. **Improve APK diagnostics without leaking secrets**
   - Add safe breadcrumbs/metadata showing only `mode`, `reused`, and order id prefix/context where appropriate.
   - Never log or expose `RAZORPAY_KEY_SECRET`.

4. **Verify**
   - Run a focused build/type check or relevant edge-function test if available.
   - Confirm the code path now creates a fresh test order after key rotation instead of reusing an old live order.

## Expected result
APK checkout will fetch the current Supabase Razorpay key through the edge function and will no longer reuse an old live-mode order after switching to test mode.