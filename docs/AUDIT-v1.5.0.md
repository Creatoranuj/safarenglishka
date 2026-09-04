# Consolidated Multi-Skill Audit — v1.5.0

**Date:** 2026-09-04
**Scope:** `Creatoranuj/safarenglishka` @ `main` + Supabase project `wegamscqtvqhxowlskfm`
**Skills applied:** senior-architect-audit, supabase-architect-auditor, red-team-security-audit, console-error-triage, perf-exam-ready, mobile-view-expert, soft-touch, razorpay-payments
**Not run (skill not active in workspace):** app-crash-shield, asset-optimization, capacitor-back-button, capacitor-video-player-master, sentry-triage

## Verdict

| Area | Rating | Summary |
|---|---|---|
| Supabase / RLS | 4.5 / 5 | RLS enabled everywhere, all admin RPCs guarded. One GRANT-overreach to fix. |
| Red team (attack surface) | 4 / 5 | No CRITICAL/HIGH exploit found. Two MEDIUM defense-in-depth gaps. |
| Payments (Razorpay) | 5 / 5 | Server-side order + signature verify + amount-tamper detection + idempotent webhooks. |
| Architecture / maintainability | 4 / 5 | 44 edge functions, shared CORS/sanitize modules, 17 CI workflows. |
| Performance | 3.5 / 5 | Route-level code splitting is in place; image lazy-loading is inconsistent. |
| Mobile / Capacitor | 4.5 / 5 | Safe-area tokens, `viewport-fit=cover`, cleartext off, App Links `autoVerify`. |
| Console / error hygiene | 4 / 5 | Error boundaries at app, player and reader level; raw `console.*` in ~20 modules. |

**No CRITICAL and no HIGH findings.** The remaining items are MEDIUM/LOW hardening and polish.

---

## Findings

### [MEDIUM] [SEC] [#2 RLS bypass] `anon` holds write GRANTs on 10 public tables

**Where:** `public.app_installs`, `content_reports`, `document_progress`, `landing_courses`, `landing_testimonials`, `leads`, `lesson_chapters`, `lesson_quiz_markers`, `live_reminders`, `study_materials`.

**Evidence:**
```sql
select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
where ns.nspname = 'public' and c.relkind = 'r'
  and (has_table_privilege('anon', c.oid,'INSERT')
    or has_table_privilege('anon', c.oid,'UPDATE')
    or has_table_privilege('anon', c.oid,'DELETE'));
```
returned those 10 tables, while a policy query for the same tables returned only two
`SELECT` policies (`landing_courses`, `landing_testimonials`) for the public role —
**no anon write policy exists**.

**Why it matters:** RLS blocked every one of those writes, so this was not
exploitable. It was a latent trap: the day anyone adds a policy `TO public` or
`USING (true)` on one of these tables, the anon key in the shipped bundle would
immediately gain write access. Grants must never be wider than the policies.

**Fix (applied in this release):**
```sql
REVOKE INSERT, UPDATE, DELETE ON
  public.app_installs, public.content_reports, public.document_progress,
  public.landing_courses, public.landing_testimonials, public.leads,
  public.lesson_chapters, public.lesson_quiz_markers, public.live_reminders,
  public.study_materials
FROM anon;
```

**Regression guard:** add the `anon_writable` query above to the security
regression checks so CI fails if any public table regains an anon write grant.

---

### [MEDIUM] [CONFIG] Leaked-password protection is disabled in Supabase Auth

**Where:** Supabase Auth settings (project `wegamscqtvqhxowlskfm`).
**Evidence:** Supabase linter → *"Leaked Password Protection Disabled"* (1 issue).
**Why it matters:** users can register with passwords already published in breach
corpora, making credential stuffing against the LMS cheap.
**Fix:** Dashboard → Authentication → Policies → enable *Leaked password protection*
(HaveIBeenPwned check). Dashboard toggle only; it cannot be applied by a migration.
**Owner action required.**

---

### [MEDIUM] [PERF] Only 18 of 97 `<img>` tags set `loading="lazy"`

**Where:** `src/**/*.tsx`.
**Evidence:** `rg -c '<img' src --glob '*.tsx'` → 97; `rg -c 'loading="lazy"' src --glob '*.tsx'` → 18.
**Why it matters:** course and banner grids fetch every thumbnail on mount, which
hurts LCP and mobile data usage under exam-day traffic.
**Fix:** add `loading="lazy" decoding="async"` to every non-hero `<img>`, keeping the
above-the-fold hero eager. Deferred to the backlog: it touches ~79 call sites and
should ship as its own reviewable PR.

---

### [LOW] [OBS] Raw `console.*` in ~20 runtime modules

**Where:** `src/utils/razorpayNative.ts`, `src/lib/supabaseHelpers.ts`,
`src/pages/LessonView.tsx`, `src/lib/resolveContentUrl.ts`, and ~16 others.
**Why it matters:** payment and content-resolution logs can carry order IDs and
signed URLs into device logs and any log forwarder.
**Fix:** route through the existing `src/lib/sentry.ts` wrapper with redaction and
make `scripts/check-console-usage.mjs` a blocking CI gate.

---

### [LOW] [MAINT] `phone_otps` has RLS enabled with zero policies

**Evidence:** linter `0008_rls_enabled_no_policy`; the table also has no GRANT to
`authenticated`.
**Assessment:** **intentional and correct** — the table is deny-all for API roles and
is reached only by `send-phone-otp` / `verify-phone-otp` through the service role.
Documented here so future audits do not re-flag it.

---

## Wins — attacks that failed

- **#1 Auth bypass** — every payment and enrollment function requires a `Bearer`
  token and validates it (`create-razorpay-order`, `verify-razorpay-payment`,
  `score-quiz`, `self-enroll-free`, `setup-admin`).
- **#3 Privilege escalation** — roles live only in `public.user_roles`; admin policies
  exclude self (`user_id <> auth.uid()`), and every `admin_*` SECURITY DEFINER
  function re-checks `public.has_role(auth.uid(),'admin')` internally — including the
  two SQL-language ones (`admin_get_batch_roster` and `get_user_profiles_admin` carry
  `WHERE public.has_role(...)`). All 20 carry `SET search_path TO 'public'`.
- **#4 Payment tamper** — `verify-razorpay-payment` re-fetches the payment from the
  Razorpay API, compares paise against the stored expected amount, logs
  `AMOUNT TAMPERING DETECTED`, and rejects caller/record `user_id` mismatch with 403.
- **#5 Webhook forgery** — `razorpay-webhook` and `razorpay-refund-webhook` refuse to
  run without `RAZORPAY_WEBHOOK_SECRET` and validate `x-razorpay-signature` before
  touching the database.
- **#10 SSRF** — `pdf-proxy`, `firecrawl-scrape`, `crawl4ai-bridge` and
  `import-banner-image` block `localhost`, `127.*`, `10.*`, `172.16-31.*`,
  `192.168.*`, `169.254.*` and IP-literal hosts; `pdf-proxy` re-validates every
  redirect hop against `public.trusted_hosts`.
- **#9 Prompt injection** — `chatbot` sanitizes every tenant-authored string through
  `_shared/sanitize.ts` before it enters the system prompt and scopes context to
  enrolled courses only.
- **#11 Rate limiting** — Postgres-backed `check_rate_limit` / `check_rate_limit_text`
  on order creation, verification, OTP send, free enrollment, chatbot and stats.
- **#13 Open redirect** — no user-controlled redirect target; `ForgotPassword` pins
  `redirectTo` to `window.location.origin`.
- **#17 Secrets in bundle** — the only JWT literal in `src/` is the Supabase
  **publishable** anon key (safe by design). No `rzp_live_`, `sk_` or `sbp_` literals.
- **#18 PII leak** — `profiles` has an explicit block-public-access policy for anon;
  `leads` is admin-read only.
- **#23/#24 Android** — `usesCleartextTraffic="false"`, `allowBackup="false"`,
  `networkSecurityConfig` present, FileProvider `exported="false"`, App Links use
  `autoVerify="true"` with an explicit path allow-list.

---

## Fix plan

| Priority | Item | Status |
|---|---|---|
| 1 | anon write GRANTs | **Applied** — migration shipped with v1.5.0 |
| 2 | Leaked-password protection | Owner action — one dashboard toggle |
| 3 | Image lazy-loading | This week — dedicated PR across ~79 `<img>` tags |
| 4 | `console.*` redaction | Backlog — route through `lib/sentry.ts`, make the guard blocking |
| 5 | `anon_writable` regression query | Backlog — add to security regression checks |

## Owner actions (only you can do these)

1. Enable leaked-password protection in the Supabase dashboard.
2. Razorpay live keys — see `docs/RAZORPAY-LIVE-SWITCH.md`. Nothing was switched in
   this pass; the project remains in test mode.

## Verification

Gates for this release are `bun install`, `bun run lint` and `bun run build`. They run
in CI (`code-guards.yml`, `playwright-e2e.yml`); this pass changed only documentation,
`package.json` version and database grants.
