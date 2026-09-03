# Safar English Ka — Master Process & Audit Document

Last updated: 2026-09-03 · Release baseline: `v1.4.7` · Supabase project `wegamscqtvqhxowlskfm`

Yeh single entry-point document hai. Project ke saare processes, invariants, CI, limits
aur current holistic rating yahin compile hain. Purane audit docs `docs/audit/` me
historical record ke taur par rahenge — rozmarra ke liye yahi file dekhein.

---

## 1. Architecture map

```text
Android APK (Capacitor, com.safarenglishka.app)
        |
        +-- WebView -> React + Vite SPA (src/)
        |        +-- @/integrations/supabase/client   (anon key, RLS applies)
        |        +-- PDF / video players, offline notes
        |
        +-- Supabase (wegamscqtvqhxowlskfm, free tier)
        |        +-- Postgres + RLS  (88 tables, app_role enum: admin/teacher/student)
        |        +-- Auth            (email/password + phone OTP)
        |        +-- Storage         (pdf-cache, content, book-covers, avatars)
        |        +-- Edge Functions  (pdf-proxy, razorpay-webhook, refund,
        |                             recover-enrollment, request-account-deletion,
        |                             manage-session)
        |
        +-- Razorpay (order -> checkout -> webhook -> enrollment)
```

Money aur access ka single source of truth **database** hai, client nahi.
Client sirf request bhejta hai; verification server/trigger side par hoti hai.

---

## 2. Security invariants (kabhi todna nahi)

| # | Invariant | Kaise enforce hota hai |
|---|-----------|------------------------|
| 1 | Student khud ko paid course me enroll nahi kar sakta | `enrollments` INSERT policy: free course **ya** `razorpay_payments.status='completed'` row zaroori |
| 2 | Payment row client se banayi/badli nahi ja sakti | `razorpay_payments` par sirf SELECT (own) + admin ALL; koi client INSERT/UPDATE policy nahi |
| 3 | `payment_requests.status` client se `approved` nahi ho sakta | `trg_force_pending_payment_request` (v1.4.7) non-admin insert ko `pending` karta hai |
| 4 | Enrollment status/course tamper nahi ho sakta | `guard_enrollment_update` + `trg_prevent_enrollment_status_tampering` |
| 5 | Doubt session ka teacher student badal nahi sakta | `trg_prevent_student_doubt_teacher_change` OLD value restore karta hai |
| 6 | Role escalation band | roles alag `user_roles` table + `prevent_self_role_escalation` + `has_role()` SECURITY DEFINER |
| 7 | Audit trail forge nahi ho sakta | **naya (yeh release)**: `audit_log` par client INSERT policy hata di, INSERT/UPDATE/DELETE grants revoke |
| 8 | OTP table client se nahi padhi ja sakti | `phone_otps`: RLS on + zero policies + koi anon/authenticated grant nahi = deny-all |
| 9 | Service role key kabhi client bundle me nahi | build ke baad bundle secret-grep (release checklist step) |
| 10 | Har `admin_*` SECURITY DEFINER function pehle admin check karta hai | verified — 11/11 functions me `has_role(auth.uid(),'admin')` |
| 11 | `complete_paid_enrollment()` client se callable nahi | authenticated/anon ke paas EXECUTE nahi; sirf service role |

---

## 3. Processes

### 3.1 Dev loop
1. Feature branch -> code change.
2. `bunx tsgo --noEmit -p tsconfig.app.json`
3. `bunx vitest run`
4. `bun run build` (budget: entry <=180 KB, vendor <=1000 KB)

### 3.2 Guarded-edit check (PDF/player ko chhune par mandatory)
```
bunx vitest run src/test/autoScrollFab.test.tsx src/test/pdfViewer-regression.test.tsx
```

### 3.3 Database migration
1. Migration tool se SQL (kabhi bhi `supabase/migrations/` file haath se edit nahi).
2. `CREATE TABLE` ke saath usi migration me `GRANT` + `ENABLE RLS` + `POLICY`.
3. Apply ke baad linter chalao, sirf naye findings fix karo.
4. Migration file repo me commit — DB aur repo hamesha in sync.

### 3.4 Release
1. Teeno gates green (typecheck / tests / build).
2. Bundle secret grep clean.
3. `package.json` version = release tag (v1.4.7 se enforce).
4. Tag push -> GitHub Release + `docs/audit/<date>-release-audit-<tag>.md`.
5. APK sirf tab jab explicitly maanga jaye.

### 3.5 APK build / sign
- Workflow `build-apk.yml` (tag push), keystore secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
- Package id **`com.safarenglishka.app`** — kabhi change nahi.
- Signed APK smoke (`signed-apk-smoke.yml`) abhi manual-only hai (flaky emulator).

### 3.6 Backup & restore (naya)
- Script: `scripts/backup-supabase.mjs` — 28 critical tables ka JSON snapshot + manifest.
- Manual run:
  `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-supabase.mjs backup`
- Restore drill: snapshot -> staging project me `POST /rest/v1/<table>` service role se -> row counts manifest se match.
- Nightly automation ke liye neeche wala workflow chahiye. **Yeh file API se push nahi ho
  saki (GitHub token ke paas `workflow` scope nahi hai)** — GitHub UI me
  `.github/workflows/supabase-backup.yml` naam se paste kar dein, aur repo secret
  `SUPABASE_SERVICE_ROLE_KEY` add karein (secret na ho to job safely skip hota hai).

<details>
<summary>supabase-backup.yml (copy-paste)</summary>

```yaml
name: Supabase Backup

on:
  schedule:
    - cron: '30 2 * * *' # daily 02:30 UTC
  workflow_dispatch:

permissions:
  contents: read

jobs:
  backup:
    name: Snapshot critical tables
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Check secrets
        id: gate
        env:
          SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          BASE: ${{ secrets.SUPABASE_URL || secrets.VITE_SUPABASE_URL }}
        run: |
          if [ -z "$SERVICE_KEY" ] || [ -z "$BASE" ]; then
            echo "::warning::Backup skipped - add repo secrets SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL."
            echo "ready=false" >> "$GITHUB_OUTPUT"
          else
            echo "ready=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Run backup
        if: steps.gate.outputs.ready == 'true'
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL || secrets.VITE_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: node scripts/backup-supabase.mjs backup

      - name: Upload snapshot
        if: steps.gate.outputs.ready == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: supabase-backup-${{ github.run_id }}
          path: backup/
          retention-days: 90
```

</details>

### 3.7 Incident / rollback

| Situation | Action |
|-----------|--------|
| Bad deploy | pichle green tag par revert, re-tag |
| Bad migration | forward-fix migration likho (down migration nahi), snapshot se data restore |
| Supabase paused | dashboard se resume; `supabase-keepalive.yml` har 5 din ping karta hai |
| Payment stuck | `recover-enrollment` function + `admin_get_suspicious_enrollments()` |
| Storage/quota alert | `pdf-cache` bucket purge (cache hai, regenerate ho jaata hai) |

---

## 4. CI workflow map

| Workflow | Trigger | Blocking? |
|----------|---------|-----------|
| code-guards | push / PR | Yes |
| skill-guards | push / PR | Yes |
| android-compile-guard | push / PR | Yes |
| enrollment-bypass | push / PR / nightly 03:15 | Yes (security regression) |
| playwright-e2e | push / PR | Yes |
| dependency-audit | weekly Mon 06:00 + push/PR | Advisory |
| razorpay-smoke | nightly 04:10 | Advisory |
| pdf-proxy-keepalive | har 10 min | Advisory |
| supabase-keepalive | har 5 din 03:00 | Advisory (fail par issue) |
| supabase-backup (pending manual add) | daily 02:30 | Advisory (fail par issue) |
| flake-trend-aggregator | nightly 03:17 | Advisory |
| build-apk | tag push / manual | Release gate |
| warm-android-cache | push | Advisory |
| lighthouse-ci / maestro-android / maestro-cloud / signed-apk-smoke | manual only | No |

---

## 5. Free-tier budget dashboard

| Resource | Limit | Current | Headroom |
|----------|-------|---------|----------|
| Database size | 500 MB | ~20 MB | 96% |
| Storage | 1 GB | ~5.8 MB (16 files) | 99% |
| Monthly active users | 50,000 | 11 | 99%+ |
| Edge function invocations | 500k/mo | near zero | Huge |
| Egress | 5 GB/mo | low | OK |

> Correction: pichhle capacity doc me storage `5.8 GB` likha tha — actual measured value
> `5.8 MB` hai (pdf-cache 4.3 MB, content 1.3 MB, book-covers 146 kB, avatars 50 kB).
> Storage koi risk nahi hai; yeh galat aankda ek "phantom loophole" tha jo dhyan asli
> risk se hata raha tha.

Thresholds: DB 350 MB, Storage 700 MB, MAU 35,000 — koi bhi cross ho to plan review.

---

## 6. Holistic rating

| Axis | Score | Reason |
|------|-------|--------|
| Security | **4.7 / 5** | RLS + trigger invariants dense; payment/enrollment path client-trust free; audit trail ab immutable. Bacha: leaked-password protection off. |
| Performance | 4.5 / 5 | Bundle budget me (entry 118 KB / 180 KB, vendor 725 KB / 1000 KB), PDF cache hit-rate acha, lazy routes. |
| Code quality | 4.0 / 5 | 296 tests pass, 0 type errors; par docs/audit sprawl aur duplicate DB functions (`n`, `n_text`). |
| Reliability | **4.2 / 5** | Keepalive + smoke workflows; ab off-site backup script bhi. Restore drill abhi run nahi hua. |
| CI/CD | 4.0 / 5 | 16 workflows, 5 blocking; signed-APK smoke manual hone se release gate patla hai. |
| Cost / Scale | 4.0 / 5 | Free tier me ~700-800 MAU tak comfortable; storage panic galat data par tha. |
| **Overall** | **4.4 / 5** | pichhla 4.1 se upar |

---

## 7. Biggest loophole (evidence-based)

**Backup / disaster recovery ka poora na hona.**

Kya mila: repo me koi backup, `pg_dump`, ya restore process nahi tha — 15 workflows me se
ek bhi backup nahi. Project Supabase **free tier** par hai jahan point-in-time recovery
nahi milti aur self-serve restore nahi hai. Matlab ek galat migration, ek accidental
`DELETE`, ya project pause/expiry se **paid enrollments, razorpay_payments, student notes
aur quiz attempts permanently ja sakte the** — aur is failure ka koi alert bhi nahi tha.
Yeh security holes se bada isliye hai kyunki RLS layer already strong nikli (upar section 2),
jabki data loss ka blast radius 100% aur irreversible tha.

Kyun pakda nahi gaya: ab tak ke saare audits "attack surface" par focus karte rahe (RLS,
payments, definer functions). **Recovery** kabhi audit hi nahi hui.

Fix (is release me): `scripts/backup-supabase.mjs` repo me merge; nightly workflow
section 3.6 me ready hai (aapko GitHub UI se add karna hai).

Runner-up loophole (fix ho gaya): `audit_log` me koi bhi signed-in user apne naam se
manghadant entry daal sakta tha — yaani forensics par bharosa hi khatam. Ab client INSERT
band, sirf service role / SECURITY DEFINER likh sakta hai.

---

## 8. Next 5 moves

1. `.github/workflows/supabase-backup.yml` add karna + repo secret `SUPABASE_SERVICE_ROLE_KEY`.
2. Ek restore drill (staging project me snapshot import) — reliability 4.2 -> 4.7.
3. Supabase dashboard me Leaked Password Protection ON (Auth -> Policies).
4. `signed-apk-smoke` stable karke tag-push par blocking banana.
5. Duplicate DB functions `n` / `n_text` ko `check_rate_limit*` ke haq me hatana.

---

## 9. Historical audit index

`docs/audit/INDEX.md` me poori list hai. Recent:
`2026-09-03-release-audit-v1.4.7.md`, `2026-09-02-final-audit.md`,
`2026-09-01-full-audit.md`, `2026-07-22-secdef-redteam.md`.
Capacity: `docs/FREE_TIER_CAPACITY.md` (storage figure ke liye upar section 5 dekhein).
