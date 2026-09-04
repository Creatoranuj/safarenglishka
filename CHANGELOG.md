# Changelog — Safar English

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
