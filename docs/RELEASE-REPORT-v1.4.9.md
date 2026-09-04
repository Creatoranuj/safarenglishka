# Final Report — v1.4.9

**Repo:** `Creatoranuj/safarenglishka` · **Branch:** `main`
**Supabase project:** `wegamscqtvqhxowlskfm`
**Date:** 2026-09-04 (UTC)
**Release:** https://github.com/Creatoranuj/safarenglishka/releases/tag/v1.4.9

---

## 1. Summary (एक नज़र में)

| # | काम | Status |
|---|---|---|
| 1 | Supabase backup workflow fix + secret setup | ✅ Done |
| 2 | Fresh backup run before any deletion | ✅ Done |
| 3 | Test transaction history delete | ✅ Done |
| 4 | Credentials audit (names only) | ✅ Done |
| 5 | Documentation (`docs/BACKUP-AND-CREDENTIALS.md`) | ✅ Done |
| 6 | Version bump 1.4.8 → 1.4.9 + changelog | ✅ Done |
| 7 | GitHub tag + release `v1.4.9` | ✅ Done |
| 8 | Razorpay Test → Live switch | 📄 Plan only (execute नहीं किया) |
| 9 | `bun install` / `bun run lint` / `bun run build` | ⏳ Local/CI पर चलाना बाकी |

---

## 2. Backup Workflow

फ़ाइल: `.github/workflows/supabase-backup.yml` → `scripts/backup-supabase.mjs`

**Fixes applied**
- `secrets.ITE_SUPABASE_URL` → `secrets.VITE_SUPABASE_URL`
- `secrets.SUPABASE_SERVICE_KEY` → `secrets.SUPABASE_SERVICE_ROLE_KEY`
- `retention-days: 90` की गलत indentation ठीक की
- YAML में एक non-printable control byte था (job zero, run instantly fail) — file
  साफ़ दोबारा लिखकर commit की

**Secret**
- Repo secret `SUPABASE_SERVICE_ROLE_KEY` libsodium sealed-box से encrypt करके
  GitHub Actions में set किया गया (HTTP 201)। Value कहीं print/commit नहीं हुई।
- Lovable का transient copy `SAFAR_SUPABASE_SERVICE_ROLE_KEY` encryption के बाद
  delete कर दिया गया — यह सिर्फ़ एक अस्थायी copy थी; असली Supabase key न revoke
  हुई न rotate, इसलिए app/backup पर कोई असर नहीं।

**Runs**

| Run ID | Trigger | Result |
|---|---|---|
| 33823166156 | push | ❌ failed (malformed YAML — अब replaced) |
| 33823355155 | manual | ✅ success, artifact ~44 KB |
| 33824581972 | manual (pre-delete backup) | ✅ success |

Schedule: रोज़ 02:30 UTC · Retention: 90 दिन · Failure पर auto GitHub issue।

---

## 3. Transaction History Cleanup

Deletion **fresh successful backup के बाद** की गई।

| Table | पहले | बाद |
|---|---|---|
| `razorpay_payments` | 1 | 0 |
| `payment_events` | 1 | 0 |
| `payment_requests` | 0 | 0 |
| `webhook_events` | 0 | 0 |
| `enrollments` | 15 | **15 (untouched)** |

हटाया गया एकमात्र record: ₹1.00 test payment, `course_id=34`,
order `order_TXU7YVhQpDVaEQ`, status `completed`, dated 2026-09-03.

---

## 4. Credentials Audit (सिर्फ़ नाम — कोई value expose नहीं)

**GitHub Actions repo secrets: 23**
- Payment: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- Supabase: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`,
  `SUPABASE_SERVICE_ROLE_KEY`
- Android signing: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
- Sentry: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `VITE_SENTRY_DSN`
- Test/E2E: `E2E_EMAIL`, `E2E_PASSWORD`, `MAESTRO_EMAIL`, `MAESTRO_PASSWORD`,
  `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_PAID_COURSE_ID`

**Edge function env vars** — 7 payment functions सिर्फ़ `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` use करते हैं (detail:
`docs/BACKUP-AND-CREDENTIALS.md` §4)।

**Findings**
- ✅ App code में कोई real `rzp_test_*` / `rzp_live_*` literal नहीं।
  सिर्फ़ `boilerplate/ionic-razorpay-ci/` में placeholder `rzp_test_REPLACE_ME`
  (sample project, production build में नहीं)।
- ✅ Frontend कभी key hardcode नहीं करता — `key_id` server response से आता है
  (`src/pages/BuyCourse.tsx`, `src/utils/openSubscriptionCheckout.ts`)।
- ✅ Service role key सिर्फ़ server-side (Edge Functions + Actions runner) में।
- ⚠️ `RAZORPAY_*` अभी test-mode values हैं — live switch के समय update करें।

---

## 5. Razorpay Test → Live (अभी execute नहीं)

Live mode **ON नहीं** किया गया — आपके निर्देश के अनुसार सिर्फ़ plan।
पूरा step-by-step checklist (pre-checks, key generation, Supabase/GitHub secret
update, webhook re-registration, ₹1 smoke test + refund, rollback)
`docs/BACKUP-AND-CREDENTIALS.md` की **section 5** में है।

Safety net पहले से मौजूद: `create-razorpay-order` का mode-guard
mismatched keys पर fail-fast करता है, और API response का `mode` field
frontend को TEST MODE badge दिखाने देता है।

---

## 6. Files changed in this release

| File | Change |
|---|---|
| `docs/BACKUP-AND-CREDENTIALS.md` | new |
| `docs/RELEASE-REPORT-v1.4.9.md` | new (यह report) |
| `.github/workflows/supabase-backup.yml` | fixed |
| `package.json` | `1.4.8` → `1.4.9` |
| `CHANGELOG.md` | v1.4.9 entry |

Older releases `v1.4.7` और `v1.4.8` बिना छेड़छाड़ के सुरक्षित हैं।

---

## 7. Pending / Next steps

1. Local या CI पर verification gates चलाएँ:
   ```bash
   bun install && bun run lint && bun run build
   ```
   (repo में अलग `typecheck`/`test` script नहीं है — build ही type gate है)
2. कल सुबह 02:30 UTC वाला पहला scheduled backup run green है या नहीं, check करें।
3. जब live payments चालू करने हों → doc की section 5 follow करें (या मुझे कहें,
   मैं execute कर दूँगा)।
