# Test payment data cleanup (Revenue → ₹0)

## Goal
Admin Dashboard ka "Total Revenue" ₹796 se ₹0 ho jaye, aur saara test payment history hat jaye — bina students ka course access chhede.

## Current state (verified)
- `razorpay_payments`: 4 rows `completed` (total ₹796) + 16 rows `pending` (₹3,988) = 20 rows total
- `payment_requests`: 0 rows (manual revenue already ₹0)
- `payment_events`: 38 rows, `webhook_events`: 6 rows (payment history/log)
- Revenue formula (`src/pages/Admin.tsx`): approved `payment_requests` + completed `razorpay_payments`

## What will be deleted
- All 20 rows from `razorpay_payments`
- All 38 rows from `payment_events`
- All 6 rows from `webhook_events`

## What stays untouched
- `enrollments` (13 rows) — students ka course access same rahega
- `user_subscriptions` (2 rows)
- Profiles, courses, progress — koi change nahi

## Technical notes
- Data-only operation via the SQL data tool (delete statements), no schema/migration change.
- No code changes needed: dashboard ₹0 dikhayega kyunki dono revenue sources khaali honge.
- Delete order: `payment_events` → `webhook_events` → `razorpay_payments` (FK-safe).
- Ye irreversible hai; sirf test data hai isliye backup nahi liya ja raha.

## Verification
Delete ke baad counts re-check karke Admin Dashboard refresh — Total Revenue ₹0, Pending Payments 0.
