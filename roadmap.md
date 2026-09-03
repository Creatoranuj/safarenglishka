
## 2026-09-02 — Real signed APK + runtime performance
- [ ] Build the real signed release APK using the repo signing secrets (KEYSTORE_BASE64 / KEYSTORE_PASSWORD / KEY_ALIAS / KEY_PASSWORD)
- [ ] Code-side performance: no hang, no crash — profile the post-login dashboard render
- [x] Verify on device + write the report (docs/perf/workflow-audit-2026-09-02.md)
- [x] Explain the "AAB not produced" warning on run #77

## 2026-09-03 — Enrollment bounce fix + free-tier capacity audit
- [x] Fix "Please purchase this course" bounce for enrolled students (LectureListing warm-cache race)
- [x] Harden ChapterView enrollment guard against the same race
- [x] Regression test: src/test/enrollment-guard-race.test.ts
- [x] FREE_TIER_CAPACITY.md — measured free-tier ceiling + failure sequence
- [ ] P0: 90-day retention pg_cron on user_sessions / chatbot_logs / pdf_proxy_metrics / error_logs / app_installs
- [ ] P0: weekly pg_dump backup workflow (free tier has no backups)
- [ ] P1: move popular PDFs from Google Drive to a CDN (per-file quota block risk)
