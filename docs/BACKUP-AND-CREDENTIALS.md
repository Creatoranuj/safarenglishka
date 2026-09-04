# Backup, Credentials & Razorpay Live-Mode Guide

_Last updated: 2026-09-04 · Release v1.4.9_

---

## 1. Supabase Backup Workflow

फ़ाइल: `.github/workflows/supabase-backup.yml` → script: `scripts/backup-supabase.mjs`

| Item | Value |
|---|---|
| Schedule | रोज़ 02:30 UTC (08:00 IST) |
| Manual run | Actions tab → Supabase Backup → Run workflow |
| Output | JSON snapshot, GitHub artifact |
| Retention | 90 दिन |
| On failure | अपने आप GitHub issue खुलता है |
| Required secrets | `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

### फ़ायदा

| परिस्थिति | बिना backup | backup के साथ |
|---|---|---|
| Accidental `DELETE`/`DROP` | डेटा हमेशा के लिए गया | 90 दिन के भीतर किसी भी दिन की स्थिति restore |
| RLS policy गलत हो गई | पता चलने पर बहुत देर | पुराना snapshot download → manually fix |
| Supabase project/account issue | डेटा stuck | बाहर independent copy |
| Migration ने schema/data ख़राब किया | rollback मुश्किल | pre-migration snapshot से restore |

- **Off-site + off-vendor** — copy Supabase के बाहर GitHub में।
- **Versioned** — हर दिन का अलग artifact।
- **Free + automatic** — कोई extra Supabase cost नहीं।
- **Manual dispatch** — release/migration से पहले हाथ से snapshot।
- **Alert on failure** — backups चुपचाप बंद नहीं हो सकतीं।
- **Restorable anywhere** — JSON है, किसी भी Postgres/Supabase में import।

---

## 2. Service Role Key — यह क्या करती है

- यह key **RLS bypass** करती है — पूरी database पर admin-level read/write।
- इसलिए इसे **कभी भी browser/frontend** में नहीं भेजा जाता। सिर्फ़ server-side
  (GitHub Actions runner, Supabase Edge Function) में।
- Backup में यही key `scripts/backup-supabase.mjs` को हर table का consistent
  snapshot लेने देती है — एक ही credential से, per-table auth के बिना।
- GitHub Actions logs में secret masked रहती है; snapshot artifact में key नहीं जाती।

**कभी न करें:** key को `VITE_*` env var, client code, या commit में डालना।

---

## 3. Restore करने का तरीका

1. Actions → Supabase Backup → वह run खोलें → artifact download करें।
2. ZIP खोलें → per-table JSON files।
3. Target project में schema migrations पहले apply करें।
4. Service role key वाले script/psql से table-wise data insert करें
   (foreign key order: profiles → courses → chapters → lessons → enrollments → बाकी)।
5. Restore के बाद RLS policies और counts verify करें।

---

## 4. Credentials Audit (नाम only — values कहीं expose नहीं)

### GitHub Actions repo secrets (23)

Payment: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
Supabase: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY`
Android signing: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
Sentry: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `VITE_SENTRY_DSN`
E2E/test: `E2E_EMAIL`, `E2E_PASSWORD`, `MAESTRO_EMAIL`, `MAESTRO_PASSWORD`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_PAID_COURSE_ID`

### Supabase Edge Function env vars

| Function | Uses |
|---|---|
| `create-razorpay-order` | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `verify-razorpay-payment` | वही |
| `initiate-refund` | वही |
| `create-subscription-order` | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `verify-subscription-payment` | वही + `SUPABASE_SERVICE_ROLE_KEY` |
| `razorpay-webhook` | `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `razorpay-refund-webhook` | वही |

### Hardcoded key scan

Repo में कोई real `rzp_test_*` / `rzp_live_*` literal नहीं है। सिर्फ़
`boilerplate/ionic-razorpay-ci/` में placeholder `rzp_test_REPLACE_ME` है
(sample project, production build का हिस्सा नहीं)।

Frontend कभी key hardcode नहीं करता — `key_id` हमेशा server response से आता है
(`src/pages/BuyCourse.tsx`, `src/utils/openSubscriptionCheckout.ts`)।

---

## 5. Test → Live Razorpay Switch (PLAN — अभी execute नहीं किया गया)

> Live mode अभी **ON नहीं** किया गया है। नीचे step-by-step checklist है।

### Pre-checks
1. Razorpay Dashboard → KYC/Account **Activated** हो।
2. Settlement bank account verify हो।
3. Backup workflow manually चलाकर fresh snapshot लें।
4. Test-mode transaction history clean है (v1.4.9 में हो चुका)।

### Steps
1. Razorpay Dashboard → Settings → API Keys → **Live mode** → Generate Key।
   `rzp_live_...` Key ID + Secret एक बार ही दिखता है — safe जगह रखें।
2. Supabase → Project Settings → Edge Functions → Secrets में update करें:
   - `RAZORPAY_KEY_ID` = `rzp_live_...`
   - `RAZORPAY_KEY_SECRET` = live secret
3. Razorpay → Settings → **Webhooks** → live mode में नया webhook बनाएँ:
   - URL: `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`
   - Events: `payment.captured`, `payment.failed`, `order.paid`
   - Refund webhook URL: `.../razorpay-refund-webhook`, events `refund.processed`, `refund.failed`
   - नया signing secret → Supabase secret `RAZORPAY_WEBHOOK_SECRET` update करें।
4. GitHub repo secrets `RAZORPAY_*` भी live values से update करें (CI parity)।
5. Edge functions redeploy करें ताकि नई secrets pick हों।
6. Frontend में कुछ नहीं बदलना — `key_id` server से आता है और response का
   `mode` field अब `live` दिखाएगा (TEST MODE badge अपने आप हट जाएगा)।

### Smoke test
1. ₹1 का temporary course बनाएँ → real card/UPI से payment करें।
2. Verify: `razorpay_payments.status = completed`, enrollment बना, webhook event आया।
3. Razorpay Dashboard से उसी payment का **full refund** करें → `razorpay-refund-webhook`
   चला या नहीं देखें।
4. Temporary course हटा दें।

### Rollback
- Supabase secrets में वापस `rzp_test_*` values डालें + test webhook secret।
- Edge functions redeploy।
- `create-razorpay-order` का mode-guard mismatched keys को fail-fast कर देता है,
  इसलिए आधा-switched state customer तक नहीं पहुँचेगा।

---

## 6. Verification Gates (local/CI)

```bash
bun install
bun run lint
bun run build
```

Repo में अलग `typecheck`/`test` script नहीं है — build ही type gate है।
