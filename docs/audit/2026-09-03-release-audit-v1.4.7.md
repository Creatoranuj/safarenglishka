# Release Audit — Safar English v1.4.7 (2026-09-03)

Fresh release ke liye poora error + security audit. Sab kuch live repo (`main`) aur live Supabase
project `wegamscqtvqhxowlskfm` par run kiya gaya hai — koi claim bina evidence ke nahi.

---

## 1. Build / error audit — sab green

| Check | Command | Result |
|---|---|---|
| Types | `bunx tsgo --noEmit -p tsconfig.app.json` | 0 errors |
| Tests | `bunx vitest run` | 39 files, **296 passed**, 4 skipped |
| Build | `bun run build` | ✓ built in 15.5s |
| Bundle budget | `scripts/check-bundle-size.mjs` | entry 118.0 KB / 180 KB, vendor 724.6 KB / 1000 KB — OK |
| Secrets in bundle | grep `service_role` / `sb_secret_` / `rzp_live_` / `sk_live_` in `dist/assets/*.js` | clean (only the Supabase SDK's own key-prefix literal) |

Heaviest lazy chunks (gzip): `pptx-preview` 403 KB, `html2pdf` 256 KB, `exceljs` 250 KB —
sab lazy hain, initial entry me nahi aate.

---

## 2. Security audit

### 2.1 FIXED in this release — HIGH: forged "approved" payment requests

`payment_requests` ki INSERT policy sirf `auth.uid() = user_id` check karti thi. `status` column
par koi restriction nahi tha (`default 'pending'`, par client apni value bhej sakta tha). Matlab
koi bhi signed-in student seedha `status = 'approved'` (ya `completed`) wali row insert kar sakta
tha, aur `approved_by` / `approved_at` bhi khud bhar sakta tha — manual payment verification
workflow bypass.

**Fix:** `trg_force_pending_payment_request` (BEFORE INSERT) — non-admin insert par `status`
zabardasti `'pending'`, aur `approved_by/at`, `rejected_by/at` NULL. Admin path unchanged.
Function `SECURITY DEFINER` + `search_path = public`, EXECUTE anon/authenticated se revoke.
Migration: `supabase/migrations/20260903131000_payment_request_status_guard.sql`.

### 2.2 Scanner findings verified as FALSE POSITIVE (defence pehle se maujood)

| Finding | Kyon false positive |
|---|---|
| "Students can grant themselves paid-course access" (`enrollments` UPDATE) | Do triggers already: `guard_enrollment_update` + `trg_prevent_enrollment_status_tampering` — `course_id`, `user_id`, `purchased_at`, `status` change par exception (admin exempt) |
| "Students can modify sensitive doubt-session fields" | `trg_prevent_student_doubt_teacher_change` student ke liye `teacher_id`, `zoom_*`, `scheduled_at`, `student_id` ko OLD value par reset kar deta hai |
| `phone_otps` — "RLS enabled, no policy" (INFO) | Policy-zero + RLS-on ka matlab hai **sab deny** — table sirf service role se accessible. Ye secure default hai, gap nahi |

### 2.3 Open (accepted / low)

- **`audit_log` INSERT spoofable** (WARN) — authenticated user apne `user_id` se arbitrary
  `action`/`table_name` likh sakta hai. Impact sirf audit-trail noise, koi access grant nahi.
  Proper fix: client insert band karke SECURITY DEFINER function se likhna. Deferred.
- **20× "Signed-in users can execute SECURITY DEFINER function"** — pehle hi review karke ignore
  kiya gaya; `definer-grants.integration.test.ts` (10 tests) live prove karta hai ki
  anon-callable leak nahi hai.
- **Leaked Password Protection** — linter abhi bhi `disabled` report kar raha hai. Dashboard me
  Authentication → Policies → "Prevent use of leaked passwords" ON karke save confirm karein.

---

## 3. Holistic rating

| Area | Rating | Note |
|---|---|---|
| Code quality | 4.0 / 5 | 0 type errors, 296 tests green; par kuch god-components (LessonView ~2.9k lines) |
| Security | 4.5 / 5 | Trigger-based tamper guards strong; is release me last real privilege-escalation band |
| Performance | 4.5 / 5 | Entry 118 KB gzip, heavy viewers lazy, CI bundle budget enforced |
| Reliability / crash | 4.0 / 5 | Crash-shield + Sentry + sourcemaps working; e2e coverage patchy |
| CI / release | 4.0 / 5 | 16 workflows, signed APK + AAB automated, bundle guard blocking |
| Cost / scale (free tier) | 3.5 / 5 | DB 20/500 MB, Auth 11/50k MAU — headroom bada, par Storage 5.8 GB vs 1 GB free plan cap |

**Overall: 4.1 / 5**

### Sabse bada loophole

**Client-trusted state columns.** Ek hi pattern baar-baar dohraaya gaya hai: RLS policy sirf
*ownership* check karti hai (`auth.uid() = user_id`) aur maan leti hai ki client galat column
nahi bhejega. `enrollments` aur `doubt_sessions` pe ye pehle triggers se patch ho chuka tha;
`payment_requests` reh gaya tha aur wahi is release ka HIGH tha.

**Permanent fix (recommended):** har aisi table ke liye ek chhota "immutable columns" trigger
pattern standardise karein — jo bhi column sirf server/admin set kar sakta hai (`status`,
`role`, `amount_paid`, `approved_*`), non-admin ke liye BEFORE INSERT/UPDATE par OLD/default
value par force kar do. Naya table banate waqt yahi checklist follow ho, taaki agli baar ye
gap create hi na ho.

### Top 5 risks (ranked)

1. Client-trusted state columns (upar) — ab tak 3 tables me mila, aage naya table banate waqt dohra sakta hai
2. Storage 5.8 GB > 1 GB free cap — billing/limit surprise ka sabse bada source
3. `audit_log` spoofing — forensics par bharosa kam karta hai
4. Leaked password protection abhi off dikh raha hai
5. God-components — refactor risk zyada, regression pakadna mushkil

### Priority

- **Abhi:** leaked-password toggle confirm karein; Storage usage clean karein
- **Is mahine:** `audit_log` insert ko definer function ke peeche le jaayein; immutable-column checklist docs me add karein
- **Baad me:** LessonView / FastPdfReader split, e2e coverage
