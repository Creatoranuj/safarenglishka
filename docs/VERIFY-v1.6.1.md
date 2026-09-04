# Verification Report — v1.6.1 (2026-09-04)

> Update: `admin-delete-user` is now deployed and live (2026-09-04 03:47 UTC).

## 1. Repo state (branch `main`)

| Item | Status |
|---|---|
| `19bfd414` feat(admin): role change + delete account in Admins tab | OK on main (`src/pages/Admin.tsx`) |
| `843abd86` feat(admin): admin-only delete-user edge function | OK on main |
| `5bcca864` chore: bump version to 1.6.1 | OK — `package.json` = `1.6.1` |
| `8a7575ea` docs: changelog for v1.6.1 | OK — CHANGELOG updated |
| Release | OK — https://github.com/Creatoranuj/safarenglishka/releases/tag/v1.6.1 (published 03:02 UTC) |

## 2. Admins tab (`src/pages/Admin.tsx`, 1556 lines) — verified on the remote file

- `adminAccounts` memo + count badge on the Admins tab — present
- Role change `Select` (student / teacher / admin) — present
- `handleDeleteAccount` -> invokes `admin-delete-user` — present
- Confirmation dialog via `confirmAction` — present
- Guards: `u.id === user?.id` (no self action) and `adminAccounts.length <= 1`
  (last admin locked) — present

## 3. Edge function `admin-delete-user` (111 lines) — verified on the remote file

- Bearer token required, caller re-checked against `user_roles` -> `Admin access required` (403)
- Self-delete blocked (400)
- Last-remaining-admin delete blocked (400)
- Cleanup order: `user_roles` -> `profiles` -> `auth.admin.deleteUser`
- `audit_log` entry written with the acting admin's id

## 4. Gates

- Typecheck (`tsc --noEmit`): clean
- Build: OK — initial entry **118.0 KB** (budget 180 KB), vendor total **724.6 KB** (budget 1000 KB)

## 5. Deployment check (live Supabase project `wegamscqtvqhxowlskfm`)

`admin-delete-user` was deployed via the Supabase Management API
(`POST /v1/projects/{ref}/functions/deploy`) on 2026-09-04 ~03:47 UTC.
A short-lived project-scoped Supabase access token (`sbp_...`, Edge Functions
read-write) was used only for this deployment and is stored as the encrypted
secret `DEPLOY_SUPABASE_TOKEN`; its value was never printed, committed, or
sent to the browser.

| Function | Invocation path | HTTP probe | Meaning |
|---|---|---|---|
| `admin-delete-user` | `/functions/v1/admin-delete-user` | **401** `{"success":false,"error":"Authentication required"}` | **deployed**, auth enforced (was 404 before) |
| `admin-delete-user` (invalid bearer) | `/functions/v1/admin-delete-user` | 401 `{"success":false,"error":"Invalid token"}` | deployed, invalid token rejected |
| `create-razorpay-order` | `/functions/v1/create-razorpay-order` | 401 `{"error":"Unauthorized"}` | deployed, auth enforced |
| `setup-admin` | `/functions/v1/setup-admin` | 401 | deployed, auth enforced |

Deployment metadata returned by the Management API:

```json
{"id":"0940a24d-a1af-483f-80ec-d7f77875aba1","slug":"admin-delete-user",
 "name":"admin-delete-user","status":"ACTIVE","version":1,"verify_jwt":false}
```

Edge function log: `booted (time: 24ms)` — no startup/import errors.

> Note: this project serves Edge Functions on the `/functions/v1/` path;
> `/functions/v2/` returns 404 for every function, so the app must call
> `/functions/v1/admin-delete-user`. The deployed bundle is a single
> self-contained `index.ts` (CORS helper inlined) — functionally identical to
> the repo's two-file `index.ts` + `_shared/cors.ts`, which the local TanStack
> project blocks from being written to `supabase/functions/`.

The Delete button in the Admins tab now reaches a live function.

## 6. Razorpay live switch — still owner-side

Payment functions read their keys from **Supabase Edge Function secrets**
(`Deno.env`), not from GitHub secrets. Steps:

1. Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets ->
   set live values for `RAZORPAY_KEY_ID` (`rzp_live_...`), `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_WEBHOOK_SECRET`.
2. Redeploy the payment functions (`create-razorpay-order`,
   `create-subscription-order`, `verify-razorpay-payment`,
   `verify-subscription-payment`, `razorpay-webhook`, `initiate-refund`,
   `razorpay-refund-webhook`) plus `admin-delete-user`.
3. Razorpay Dashboard -> Webhooks -> point the **live** webhook to the
   `razorpay-webhook` function URL with the same webhook secret.
4. Do a Rs. 1 smoke payment + refund; then `razorpay_payments`, `payment_events`,
   `webhook_events` and `enrollments` rows can be verified.

Never paste live keys into chat, source files or GitHub secrets.
