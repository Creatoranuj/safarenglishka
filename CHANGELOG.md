# Changelog — Safar English

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [v1.6.2] - 2026-09-04

### Changed
- `admin-delete-user` edge function **deployed live** on Supabase project `wegamscqtvqhxowlskfm`
  (status ACTIVE, version 1). The Delete account / role change actions in the Admins tab now
  work end-to-end; before this the function existed only in the repo and returned 404.
- Deploy bundle inlines the shared CORS helper, because the Management API deploy path could not
  resolve `../_shared/cors.ts`. Repository source keeps the two-file layout.

### Docs
- `docs/VERIFY-v1.6.1.md` updated with the deployment evidence and the correct
  `/functions/v1/` invocation path (401 for unauthenticated / invalid token, clean boot log).

### Notes
- Razorpay still in **test mode** — live switch is owner-side (Supabase Edge Function secrets +
  live webhook). Leaked-password protection still pending in Supabase -> Authentication -> Policies.

---

## [v1.6.1] - 2026-09-04

### Added
- Admin panel -> **Admins** tab: per-admin **role change** (Student / Teacher / Admin)
  and **Delete account** action with a destructive confirmation dialog.
- `supabase/functions/admin-delete-user` - admin-only edge function that verifies the caller's
  admin role with the service role, then deletes `user_roles`, `profiles` and the
  `auth.users` identity, and writes an `audit_log` entry.

### Security
- Server-side guards mirror the UI guards: self-delete and deleting/demoting the last
  remaining admin are rejected by the edge function, so calling it directly cannot
  lock the project out of admin access.

---

## [v1.6.0] — 2026-09-04

### Added
- `scripts/check-anon-grants.mjs` + `.github/workflows/anon-grants-guard.yml` —
  automated regression guard that fails if the logged-out `anon` role ever regains
  `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on a public table. Runs on every migration
  push and nightly at 03:00 UTC. Also available as `bun run guard:anon-grants`.
- `public.anon_write_grants()` — admin-only (`service_role`) introspection function
  backing that guard (`supabase/migrations/20260904014500_anon_write_grants_guard_fn.sql`).
- `docs/CHECKLIST-v1.6.0.md` — the completed checklist and run-list evidence for this
  release, plus the remaining owner actions.

### Security
- Revoked the leftover `TRUNCATE` grant for the anonymous role on 14 public tables
  (`app_installs`, `content_reports`, `dependency_scan_reports`, `document_progress`,
  `landing_courses`, `landing_testimonials`, `lesson_chapters`, `lesson_quiz_markers`,
  `lesson_video_meta`, `live_reminders`, `payment_events`, `pdf_proxy_metrics`,
  `profiles_public`, `study_materials`). The v1.5.0 pass revoked write grants but not
  `TRUNCATE`; the new guard found it. Read access is unchanged.

### Performance
- Added `loading="lazy"` + `decoding="async"` to 60 `<img>` tags across 31 files.
  Above-the-fold brand marks (`BrandMark`, `Header`, landing `Index` logo) stay
  `eager` so the LCP element is not deferred. `Picture` and `SmartImage` already
  handled this via their `priority` prop and are untouched.

### Fixed
- `scripts/guards/guards.mjs` — the `supabase-rls` guard now strips SQL comments
  before scanning, so a migration that only *mentions* `SECURITY DEFINER` in an
  explanatory comment is no longer reported as a finding
  (`20260903131824_audit_log_client_insert_lockdown.sql` was a false positive).

### Notes
- Razorpay is still in **test mode**. All payment code reads `RAZORPAY_KEY_ID` /
  `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` from Supabase function secrets
  only — no test key is hardcoded anywhere — so the Test → Live switch is a
  secrets-and-webhooks change with no code change. See `docs/RAZORPAY-LIVE-SWITCH.md`.

---

## [v1.5.0] — 2026-09-04

### Added
- `docs/AUDIT-v1.5.0.md` — consolidated multi-skill audit (architecture, Supabase/RLS,
  red team, payments, performance, mobile, console hygiene) with per-area ratings,
  reproducible evidence for every finding and a prioritised fix plan.
- `docs/RAZORPAY-LIVE-SWITCH.md` — Test → Live runbook: which secrets change, live
  webhook setup, the seven functions to redeploy, ₹1 smoke test and rollback.

### Security
- Revoked `INSERT`, `UPDATE` and `DELETE` grants for the anonymous role on ten public
  tables (`app_installs`, `content_reports`, `document_progress`, `landing_courses`,
  `landing_testimonials`, `leads`, `lesson_chapters`, `lesson_quiz_markers`,
  `live_reminders`, `study_materials`). RLS already blocked these writes; the grants
  were wider than the policies, so a future permissive policy could have opened them.
  Read access is unchanged.

### Notes
- Audit result: **no CRITICAL and no HIGH findings.** Remaining items are MEDIUM/LOW.
- Owner action: enable leaked-password protection in the Supabase Auth dashboard.
- Razorpay remains in **test mode**; the live switch is documented only, not executed.

---

## [v1.4.9] — 2026-09-04

### Added
- `docs/BACKUP-AND-CREDENTIALS.md` — Supabase backup workflow guide (Hindi),
  Service Role key security explanation, restore steps, full credentials audit
  and a step-by-step Razorpay Test → Live switch plan.

### Fixed
- `.github/workflows/supabase-backup.yml`: corrected `secrets.VITE_SUPABASE_URL`
  and `secrets.SUPABASE_SERVICE_ROLE_KEY` references and artifact
  `retention-days` indentation; workflow now dispatches and completes green.

### Changed
- Test transaction history cleared from the database
  (`razorpay_payments`, `payment_events`, `payment_requests`, `webhook_events`).
  Student enrollments were left untouched.
- Repository secret `SUPABASE_SERVICE_ROLE_KEY` added so nightly backups run.

### Notes
- Razorpay remains in **test mode**. Live-mode switch is documented only,
  not executed — see section 5 of the new doc.


---

## [v1.4.8] — 2026-09-04

### Added
- Stripe payment integration (configuration pending)
- GitHub Actions automated APK build workflow
- Supabase nightly backup workflow (`.github/workflows/supabase-backup.yml`) driving
  `scripts/backup-supabase.mjs`, with a secret gate, 90-day artifact retention and an
  automatic alert issue on failure
- Supabase keepalive workflow to prevent free-tier 7-day inactivity pause
- Release/QA process docs (`docs/PROJECT-PROCESSES.md`, `docs/RELEASE-QA-CHECKLIST.md`)

### Changed
- Complete rebrand from "Sadguru Coaching Classes" to "Safar English"
- Chatbot renamed from "Sadguru Sarthi" to "Safar Sarthi"
- Session management stripped for instant login
- Fetch retry with exponential backoff on Supabase client
- Vercel deployed to Mumbai region (bom1)

### Fixed
- Keepalive probe switched to a narrow anon-readable SELECT — the PostgREST root
  now returns 401 for anon keys and was raising a false alarm issue every 5 days

### Notes
- `v1.4.7` was tagged without a matching `package.json` bump; `package.json` moves
  straight from `1.3.0` to `1.4.8` here so the file and the tags line up again.

---

## [v1.0.0] — 2026-03-08

### Added
- Full student dashboard with course browsing and enrollment
- Video player with watermark, custom controls, end-screen overlay
- PDF viewer supporting direct links, Google Drive, and Archive.org
- Quiz engine with timer, question palette, mark-for-review, score results
- Safar Sarthi AI chatbot (RAG-powered, Hinglish support)
- Razorpay payment integration with manual UPI fallback
- Admin panel: course management, chapter/lesson editor, quiz builder, analytics
- Live class support (YouTube Live embed + Zoom)
- Mentor chat with online status indicators
- Notices, timetable, syllabus, and attendance tracking
- PWA support (installable from browser on Android and iOS)
- Capacitor Android APK support

### Security
- Row-level security on all Supabase tables
- Admin/teacher/student role separation via `user_roles` table
- Secure quiz answer delivery via `questions_for_students` view

---

## How to Create a New Release

1. Make your changes and push to `main`
2. Tag the release:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
3. GitHub Actions automatically builds the APK and publishes it to the Releases page
4. Share the GitHub Releases URL with students
