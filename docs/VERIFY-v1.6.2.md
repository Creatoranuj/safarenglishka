# Verification Report — v1.6.2

**Repo:** [Creatoranuj/safarenglishka](https://github.com/Creatoranuj/safarenglishka) (branch `main`)
**Supabase project:** `wegamscqtvqhxowlskfm`
**Report generated:** 2026-09-05 (UTC)
**Package version:** `1.6.2`

---

## 1. Release trail

| Item | Link |
|---|---|
| Release v1.6.2 | https://github.com/Creatoranuj/safarenglishka/releases/tag/v1.6.2 |
| Release v1.6.1 | https://github.com/Creatoranuj/safarenglishka/releases/tag/v1.6.1 |
| Release v1.6.0 | https://github.com/Creatoranuj/safarenglishka/releases/tag/v1.6.0 |

| Commit | What it carried |
|---|---|
| [`1163b0c`](https://github.com/Creatoranuj/safarenglishka/commit/1163b0c) | v1.6.0 — image lazy-loading, logger hygiene, anon-grant guard |
| [`19bfd41`](https://github.com/Creatoranuj/safarenglishka/commit/19bfd41) | Admins tab: role change + delete account UI |
| [`843abd8`](https://github.com/Creatoranuj/safarenglishka/commit/843abd8) | `supabase/functions/admin-delete-user/index.ts` |
| [`33bc963`](https://github.com/Creatoranuj/safarenglishka/commit/33bc963) | `docs/VERIFY-v1.6.1.md` |
| [`c0cf829`](https://github.com/Creatoranuj/safarenglishka/commit/c0cf829) | Post-deployment verification of `admin-delete-user` |
| [`be1a849`](https://github.com/Creatoranuj/safarenglishka/commit/be1a849) | `package.json` bumped to 1.6.2 |
| [`588b64e`](https://github.com/Creatoranuj/safarenglishka/commit/588b64e) | CHANGELOG entry for 1.6.2 |

---

## 2. Edge functions — live status

Checked against the Supabase Management API on 2026-09-05.

| Function | Status | Version | Last deployed (UTC) |
|---|---|---|---|
| `create-razorpay-order` | ACTIVE | 194 | 2026-09-02 15:43 |
| `verify-razorpay-payment` | ACTIVE | 199 | 2026-09-02 15:43 |
| `razorpay-webhook` | ACTIVE | 161 | 2026-09-02 15:43 |
| `razorpay-refund-webhook` | ACTIVE | 161 | 2026-09-02 15:43 |
| `initiate-refund` | ACTIVE | 161 | 2026-09-02 15:43 |
| `create-subscription-order` | ACTIVE | 153 | 2026-09-02 15:43 |
| `verify-subscription-payment` | ACTIVE | 158 | 2026-09-02 15:43 |
| `admin-delete-user` | ACTIVE | 1 | 2026-09-04 03:46 |

### Route probe (unauthenticated POST, empty body)

Base: `https://wegamscqtvqhxowlskfm.supabase.co/functions/v1/<slug>`

| Route | HTTP | Expected? |
|---|---|---|
| `/create-razorpay-order` | 401 | yes — auth required |
| `/verify-razorpay-payment` | 401 | yes |
| `/initiate-refund` | 401 | yes |
| `/create-subscription-order` | 401 | yes |
| `/verify-subscription-payment` | 401 | yes |
| `/admin-delete-user` | 401 | yes — admin-only |
| `/razorpay-webhook` | 400 | yes — signature missing, not auth-gated by design |
| `/razorpay-refund-webhook` | 400 | yes |

No route returned 404, so every payment path and the admin delete path is reachable and correctly closed to anonymous callers.

### Secrets note

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` live only in Supabase Edge Function secrets (encrypted, read via `Deno.env` at request time). Their values are not readable through any API, so **live vs test mode cannot be proven from here** — confirm it either by the `rzp_live_` prefix in Supabase Dashboard, Edge Functions, Secrets, or by the absence of the Razorpay "Test Mode" banner on the real checkout sheet.

The seven payment functions were **not** re-deployed in this pass: they are ACTIVE and healthy, and secrets are read at request time, so a key switch needs no redeploy. A redeploy is required only when the function *source* changes.

---

## 3. Test results

Run on a clean checkout of `main`:

| Gate | Result |
|---|---|
| `bun install` | pass — 1007 packages |
| `bunx vitest run src/test/autoScrollFab.test.tsx` | pass — 1 file, 2 tests |
| typecheck + build (v1.6.1 pass) | pass — entry 118 KB / 180 KB, vendor 724.6 KB / 1000 KB |

---

## 4. Database state (read-only)

- Payment tables (`razorpay_payments`, `payment_events`, `webhook_events`, `payment_requests`): emptied during the v1.4.9 test-data cleanup; the 15 enrollments were untouched.
- `user_roles`: 4 admins, 13 students, 0 teachers at the last check.
- Anonymous write grants on public tables: revoked, guarded by `scripts/check-anon-grants.mjs`.

---

## 5. Still open (owner actions)

1. Supabase, Authentication, Policies: enable **leaked password protection**.
2. Razorpay live dashboard, Webhooks: point to `https://wegamscqtvqhxowlskfm.supabase.co/functions/v1/razorpay-webhook` and `.../razorpay-refund-webhook`, then store the generated secret as `RAZORPAY_WEBHOOK_SECRET`.
3. Do a 1 rupee live payment and refund it; after that the rows in `razorpay_payments`, `payment_events`, `webhook_events` and `enrollments` can be verified.
4. **Revoke the temporary deploy token**: Supabase Dashboard, Account, Access Tokens — revoke the short-lived project-scoped token used for the `admin-delete-user` deployment. It is no longer needed.
