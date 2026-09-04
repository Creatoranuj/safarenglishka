# v1.6.0 — Checklist, Run List and Live-Switch Status

Date: 2026-09-04 · Branch: `main` · Supabase project: `wegamscqtvqhxowlskfm`

Order followed: **checklist → run list green → push → live-switch status**.

---

## 1. Checklist (done)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Image lazy-loading | ✅ done | 60 `<img>` in 31 files now carry `loading="lazy"` + `decoding="async"`. Brand marks above the fold (`BrandMark.tsx`, `Layout/Header.tsx`, `pages/Index.tsx`) set `loading="eager"` so the LCP element is not deferred. `Picture.tsx` / `SmartImage.tsx` already did this via their `priority` prop — untouched. Remaining `<img>` matches are `<img>` inside JSDoc comments. |
| 2 | Console hygiene | ✅ already in place | `src/lib/log.ts` (`logInfo`/`logWarn`/`logError` → Sentry + native breadcrumbs) is the sink, and `scripts/check-console-usage.mjs` enforces the budget: **101/141 raw `console.*`, within budget**. No change needed. |
| 3 | Anon-write regression guard | ✅ done | `scripts/check-anon-grants.mjs` + `.github/workflows/anon-grants-guard.yml` + `public.anon_write_grants()`. |
| 4 | Guard false positive | ✅ fixed | `scripts/guards/guards.mjs` now strips SQL comments before the `supabase-rls` scan. |

### What the new guard already caught

On its very first run it found that the v1.5.0 revoke had **missed `TRUNCATE`**:

```text
[anon-grants] FAIL - 14 public table(s) writable by the anon role:
  app_installs, content_reports, dependency_scan_reports, document_progress,
  landing_courses, landing_testimonials, lesson_chapters, lesson_quiz_markers,
  lesson_video_meta, live_reminders, payment_events, pdf_proxy_metrics,
  profiles_public, study_materials   (all: TRUNCATE)
```

Migration `20260904014600_revoke_anon_truncate.sql` was applied. Re-run:

```text
[anon-grants] OK - anon role has no INSERT/UPDATE/DELETE grant on any public table.
```

Read access on those tables is unchanged.

---

## 2. Run list (all green)

| Gate | Result |
|------|--------|
| `bun install` | ✅ 1007 packages |
| `bun run build` | ✅ built in 10.6s |
| `postbuild` bundle budget | ✅ entry 118.0 KB (budget 180 KB), vendor 724.6 KB (budget 1000 KB) |
| `bun run guard:all` | ✅ all 14 skill guards within budget (was 1 over before the comment-stripping fix) |
| `bun run guard:anon-grants` | ✅ 0 anon write grants |
| `bunx eslint .` | ⚠️ 44 errors / 570 warnings — **all pre-existing**, none in any file touched by this release. 37 are in the vendored `public/pdfjs/web/viewer.mjs`; the rest are `no-useless-escape` / `ban-ts-comment` / `no-restricted-imports` in edge functions and `src/lib/installTracker.ts`. Not touched, to keep this diff reviewable. |

---

## 3. Razorpay: Test → Live status

**Code is already live-ready — no code change is required to switch.** Verified:

- Every payment path (`create-razorpay-order`, `create-subscription-order`,
  `verify-razorpay-payment`, `verify-subscription-payment`, `razorpay-webhook`,
  `razorpay-refund-webhook`, `initiate-refund`, `recover-enrollment`) reads
  `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` from `Deno.env` only.
- No `rzp_test_*` or `rzp_live_*` value is hardcoded anywhere in `src/`,
  `supabase/functions/` or `server/`. The only literal match is the
  secret-scanner pattern in `scripts/guards/guards.mjs`.
- `create-razorpay-order` already derives mode from the key prefix and logs an
  error on an unexpected prefix; `create-subscription-order` returns
  `mode: 'test' | 'live'` from the same prefix. So the app follows the secret.

**The switch is therefore a secrets + webhook change only**, and it needs the
account owner because live credentials must never leave the Razorpay dashboard
by any route other than the Supabase secrets UI.

Steps (also in `docs/RAZORPAY-LIVE-SWITCH.md`):

1. Razorpay Dashboard → switch to **Live** → Settings → API Keys → generate live keys.
2. Supabase → Project Settings → Edge Functions → Secrets: set
   `RAZORPAY_KEY_ID` = `rzp_live_...`, `RAZORPAY_KEY_SECRET` = live secret.
3. Razorpay → Settings → Webhooks (Live): register the payment and refund webhook
   URLs, then copy the generated signing secret into `RAZORPAY_WEBHOOK_SECRET`.
4. Redeploy the seven payment functions so they pick up the new secrets.
5. ₹1 live payment → confirm the `razorpay_payments` row and the enrollment →
   refund it → confirm the refund webhook row.
6. Rollback = restore the three test secrets. No code change, no redeploy of app code.

---

## 4. Remaining owner action

**Supabase → Authentication → Policies → enable leaked password protection.**
Still the only open item from the v1.5.0 audit; it is a dashboard toggle and
cannot be set from a migration.

The other two linter entries are reviewed and intentional: `phone_otps` is
RLS-enabled with no policy (deny-by-default for API roles, written only by the
OTP edge functions via service role), and the 20 `SECURITY DEFINER` functions
callable by signed-in users each enforce `has_role(auth.uid(), 'admin')` or an
ownership check internally and pin `SET search_path = public`.
