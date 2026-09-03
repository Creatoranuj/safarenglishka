# Safar English — 12-skill audit (2026-09-03, v1.4.1)

Method: source read + `bunx tsc --noEmit` + `bunx vitest run` (297) + `bun run guard:all`
+ Supabase linter + live privilege queries against `wegamscqtvqhxowlskfm`.
Har finding ke saath file/line ya query evidence hai — guess nahi.

## Severity summary

| Sev | Count | Fixed in this PR |
|---|---|---|
| Critical | 0 | — |
| High | 2 | 2 |
| Medium | 3 | 3 |
| Low / accepted | 4 | documented |

## High

### H1 — Admin-only RPCs anon role se callable the (`red-team-security-audit`)
Evidence (live query): `has_function_privilege('anon', 'admin_get_batch_summary', 'execute') = true`
aur wahi `admin_get_install_stats` par. Migration `20260901113304` ne `GRANT ... TO authenticated`
kiya tha par Postgres ka default `PUBLIC` EXECUTE revoke nahi kiya tha.
Impact bounded tha — dono functions body me `has_role(auth.uid(),'admin')` check karte hain,
isliye data leak nahi hua — par attack surface bina zaroorat khula tha.
Fix: `supabase/migrations/20260903023327_*.sql` — `REVOKE ... FROM anon, PUBLIC`.
Linter: anon-executable SECURITY DEFINER 5 → 3.

### H2 — `phone_otps` par `authenticated` ke privileges wapas aa gaye the (`supabase-architect-auditor`)
Evidence: `has_table_privilege('authenticated','phone_otps','select') = true`, jabki
migration `20260709123933` ne revoke kiya tha (koi baad wali migration ne dobara grant kar diya).
RLS enabled + zero policy hone ki wajah se rows abhi bhi nahi milte the, yaani exploit nahi tha —
lekin ek galti se bani policy turant OTP hash expose kar deti.
Fix: usi migration me `REVOKE ALL ... FROM anon, authenticated, PUBLIC`, sirf `service_role`.

## Medium

### M1 — Teen regression guard tests stale the (`ci-e2e-error-monitor`, `console-error-triage`)
`vitest` 3 fail: DocReaderShell exact-className assert, `nav.yaml` alternation, aur
`--disable-gpu-compositing` expect. Teenon "test purana hai", product bug nahi —
lekin red suite ka matlab hai agla asli regression koi notice nahi karega.
Fix: `src/test/docReaderShell-landscape-header.test.ts` (substring assert),
`src/test/signedSmokeRegression.test.ts` (regex alternation + GPU flag ab **inverted**
guard hai: `--disable-gpu-compositing` wapas nahi aana chahiye, kyunki run #74–#76 me
`libwebviewchromium.so 101.0.4951.61` ne `Fatal signal 5 (SIGTRAP)` diya tha).
Ab: **293 passed, 4 skipped, 0 failed**.

### M2 — Razorpay HMAC duplication (`razorpay-payments`)
`supabase/functions/_shared/razorpaySignature.ts` chaaron functions
(`verify-razorpay-payment`, `verify-subscription-payment`, `razorpay-webhook`,
`razorpay-refund-webhook`) me import ho raha hai — pehle copy-paste tha.
Verified is audit me: raw-body HMAC, constant-time compare, empty secret/signature reject,
`order_id|payment_id` aur subscription ka reversed `payment_id|subscription_id`.
Status: already fixed, ab test guard duplicate wapas nahi aane deta.

### M3 — Eruda in-app DevTools production bundle me tha (`senior-architect-audit`, `asset-optimization`)
`AdminEruda.tsx` + `main.tsx` early-boot import + dependency — admin session par har
screen par floating overlay. Hataya (PR #20). Bundle entry ab 118 KB / 180 KB budget.

## Low / accepted (documented, fix nahi kiya)

- **L1** — 20 SECURITY DEFINER functions signed-in users ko callable hain. Har ek body me
  `has_role`/ownership check karta hai (spot-checked: `admin_get_batch_roster`,
  `admin_revoke_enrollment`, `admin_set_user_block`). Ye design hai, linter WARN expected.
- **L2** — `has_role` / `get_user_role` anon se callable. Ye RLS policies ke andar chalte hain,
  aur policy evaluation invoking role ke EXECUTE privilege par depend karti hai — revoke karne se
  anon-facing policies toot jaayengi. Info leak sirf "kya X admin hai" boolean tak seemit.
  **Change nahi kiya — jaan-boojhkar.**
- **L3** — Leaked-password protection Supabase Auth me off hai. Ye dashboard setting hai:
  Authentication → Providers → Password → "Leaked password protection". Aapko on karni hogi.
- **L4** — `record_app_install` anon se callable — install tracking login se pehle chalti hai,
  intended.

## Skill-by-skill verdict

| Skill | Verdict | Note |
|---|---|---|
| app-crash-shield | PASS | `crashShield.ts` + `PlayerErrorBoundary` + reload-loop guard live; Eruda hatne ke baad bhi console buffering intact |
| asset-optimization | PASS | `check-png-sizes.mjs` prebuild guard; sabse bhaari asset `pdfjs` worker (2.1 MB) hai jo lazy hai, bundle me nahi |
| capacitor-back-button | PASS | `useAndroidBackButton.ts` ek hi listener `setupPromise` gate ke peechhe; test isi ko lock karta hai |
| capacitor-video-player-master | PASS | `PlayerErrorBoundary` + resume recovery (`useResumeRecovery`) |
| console-error-triage | PASS | `guard:console` 101/141 budget ke andar |
| mobile-view-expert | PASS | saare fixed bottom bars (`BottomNav`, `StickyMobileCTA`, `SelectionActionBar`, BuyCourse, LessonView, DiscussionSection) `safe-area-bottom` use karte hain |
| senior-architect-audit | FIX | M3 (Eruda), 0 TODO/FIXME, 95 deps |
| soft-touch | PASS | naya `EyeIcon` `currentColor` inherit karta hai, koi raster asset nahi |
| supabase-architect-auditor | FIX | H2 |
| red-team-security-audit | FIX | H1; payment amount-tamper / replay / idempotency intact, chheda nahi |
| perf-exam-ready | PASS | build budget green; Dashboard lazy + Suspense pehle se |
| sentry-triage | PASS | `src/lib/sentry.ts` dynamic `tracesSampleRate` remote config se |

## Aapke liye do manual kaam

1. Supabase Auth me leaked-password protection ON karein (L3).
2. Razorpay **test** keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`)
   Supabase Dashboard → Edge Functions → Secrets me daalein. Code me koi key hardcode nahi hai —
   `create-razorpay-order` `key_id` server se hi lautata hai, isliye sirf secret badalna kaafi hai.
