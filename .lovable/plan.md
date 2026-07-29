## Diagnosis (verified in the code)

The APK build workflow is **not** where the Razorpay key comes from. Verified: /skill:app-crash-shield  
/skill:asset-optimization  
/skill:capacitor-back-button  
/skill:capacitor-video-player-master  
/skill:console-error-triage  
/skill:mobile-view-expert  
/skill:senior-architect-audit  
/skill:soft-touch  
/skill:supabase-architect-auditor  
/skill:red-team-security-audit  
/skill:perf-exam-ready  
/skill:razorpay

&nbsp;

- `.github/workflows/build-apk.yml` passes only `VITE_SUPABASE_*`, `VITE_SENTRY_DSN`, and keystore secrets to the build. There is no `RAZORPAY_*` variable anywhere in that file.
- `rg RAZORPAY src/` returns **nothing** — the React bundle never embeds a Razorpay key.
- The checkout key is fetched at runtime: `src/pages/BuyCourse.tsx:338` uses `orderData.key_id`, and that value is returned by the edge function `supabase/functions/create-razorpay-order/index.ts:261`, which reads `Deno.env.get('RAZORPAY_KEY_ID')` — i.e. the **Supabase secret**, not GitHub.

So a test key added to GitHub Actions secrets has zero effect on the app; every install (APK, web, preview) keeps using whatever `RAZORPAY_KEY_ID` is stored in Supabase — currently the live key.

## Fix

1. **Switch the Supabase secret** — replace `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in Supabase secrets with the `rzp_test_...` pair (this is the only change that actually flips the app to test mode). I'll open the secure secret form for you.
2. **Also update `RAZORPAY_WEBHOOK_SECRET**` to the test-mode webhook secret, otherwise webhook signature verification fails and enrollment after a test payment silently stops.
3. **Make the mode visible instead of guessable** — `create-razorpay-order` already logs the key prefix; extend the order response with a non-secret `mode: 'test' | 'live'` field derived from the key prefix, and show a small "TEST MODE" badge on the checkout screen (`BuyCourse.tsx`) whenever `mode === 'test'`. This prevents the exact confusion you hit: no one can tell test from live today.
4. **Guard against accidental live-in-CI** — add a step to `razorpay-smoke.yml` that fails the job if `RAZORPAY_KEY_ID` does not start with `rzp_test_`, so CI can never transact against live.
5. **Document the routing** in `docs/manuals/ADMIN-MANUAL.md`: GitHub secrets = CI-only smoke tests; Supabase secrets = what the real app uses.

## Technical notes

- No frontend key hardcoding is introduced — the key still arrives from the server per request.
- `mode` is derived server-side from `RAZORPAY_KEY_ID.startsWith('rzp_test_')`; only the boolean-ish string is returned, never the key itself beyond the existing public `key_id`.
- Switching to a test key means existing **live** payment records won't verify against the test API; `recover-enrollment` for old live orders will return "not found" while test keys are active. Switch back to live before release.

## Confirm before I build

Do you want the app itself switched to test mode now (step 1–2), or should the app stay on live keys and only CI use test keys? I'll ask this before touching secrets.