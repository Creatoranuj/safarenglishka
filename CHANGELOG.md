# Changelog — Naveen Bharat

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Stripe payment integration (configuration pending)
- GitHub Actions automated APK build workflow

### Changed
- Complete rebrand from "Sadguru Coaching Classes" to "Naveen Bharat"
- Chatbot renamed from "Sadguru Sarthi" to "Naveen Sarthi"
- Session management stripped for instant login
- Fetch retry with exponential backoff on Supabase client
- Vercel deployed to Mumbai region (bom1)

---

## [v1.0.0] — 2026-03-08

### Added
- Full student dashboard with course browsing and enrollment
- Video player with watermark, custom controls, end-screen overlay
- PDF viewer supporting direct links, Google Drive, and Archive.org
- Quiz engine with timer, question palette, mark-for-review, score results
- Naveen Sarthi AI chatbot (RAG-powered, Hinglish support)
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
