# Capacitor Audit — Naveen Bharat

**Date:** 2026-06-07
**Auditor lens:** `senior-architect-audit` skill across all 15 Capacitor skills
**Overall rating: 4 / 5** — Solid Capacitor integration with smart performance and security choices. A few HIGH-severity gaps in offline coverage and observability remain.

> One-shot consolidated report. Per-skill batches A–E (Foundations → UX → Reliability → Integrations → Quality gates) have been merged into the findings tables below.

---

## Per-Skill Scorecard

| # | Skill | Rating | Headline |
| --- | --- | --- | --- |
| 1 | webapp-to-capacitor | 5/5 | Clean `webDir`, prod has no `server.url`, scheme set correctly |
| 2 | capacitor-best-practices | 4/5 | Lazy plugin imports done well; bridge-call batching not enforced |
| 3 | capacitor-deep-linking | 4/5 | `useDeepLinks` exists; needs login-redirect-after-link test |
| 4 | capacitor-keyboard | 4/5 | `resize: 'native'` + `--nb-keyboard-h` var is the right call |
| 5 | capacitor-offline-first | 3/5 | OfflineBanner present; query persister exists; no mutation queue |
| 6 | capacitor-performance | 4/5 | `lazyWithRetry` everywhere; perf overlay gated; bundle could shrink |
| 7 | capacitor-plugins | 4/5 | Plugin set is current; no duplicates; one unused dep likely |
| 8 | capacitor-security | 4/5 | `webContentsDebuggingEnabled` properly env-gated; needs CSP meta |
| 9 | capacitor-splash-screen | 5/5 | JS-controlled hide + 2 s safety timeout — best-practice |
| 10 | capacitor-testing | 2/5 | No tests detected for native paths or plugins |
| 11 | debugging-capacitor | 4/5 | Debug gating correct; logs strategy documented in CI |
| 12 | ionic-design | N/A | Project does not use Ionic — Tailwind + Radix instead. Skip. |
| 13 | ios-android-logs | 3/5 | No runbook; APK build uploads gradle logs on failure (good) |
| 14 | safe-area-handling | 4/5 | `safe-area-top/bottom` utility classes used consistently |
| 15 | tailwind-capacitor | 4/5 | Tailwind v3 + Radix; safe-area + viewport classes present |

---

## Findings (CRITICAL & HIGH only — full list below)

### [CRITICAL] [DATA] Smart Notes had no Data API GRANTs — FIXED in this audit
**Where:** `public.smart_notes`
**Why:** RLS policies existed but the table had no `GRANT` to `authenticated` or `service_role`. PostgREST silently denied all reads/writes. Symptom: notes appeared empty after leaving the lesson view because the insert had failed and the read returned nothing.
**Fix:** Added `GRANT SELECT,INSERT,UPDATE,DELETE … TO authenticated`, `GRANT ALL … TO service_role`, plus partial unique indexes `(user_id, lesson_id)` and `(user_id, course_id)` so `upsert` is well-defined. `useSmartNote.save` now uses `upsert(payload, { onConflict })` instead of insert/update fork.

### [HIGH] [RELY] No mutation queue when offline
**Where:** `src/lib/perf/queryPersister.ts`, hooks using `useMutation`
**Why:** `OfflineBanner` and `useOnlineStatus` exist, but mutations performed while offline are not queued — they fail and the user loses the action. This is the gap between "feels native" and "is native".
**Fix:** Wrap critical mutations (`smart_notes.upsert`, `lesson_progress` update, `lesson_bookmarks` create) with a tiny offline queue (Capacitor `Preferences` storage) that flushes on `App` resume + Network status `connected`.

### [HIGH] [OBS] Errors are swallowed by `console.error` in several hooks
**Where:** `src/hooks/useSmartNote.ts`, others using `.catch(() => {})`
**Why:** Production has no error reporter; silent failures are invisible. With Capgo live updates shipping JS bundles independently of native, a broken bundle would not raise a flag.
**Fix:** Add a thin wrapper (Sentry or a Supabase `app_errors` table writer) and replace silent `console.error` calls with `reportError(err, { surface: '…' })`.

### [HIGH] [PERF/CONFIG] APK workflow can be trimmed further — FIXED in this audit
**Where:** `.github/workflows/build-apk.yml`
**Why:** Already well-tuned. Remaining wins: bun install cache, gradle daemon flags, single-command icon restore. See Phase 2 commit.

### [HIGH] [UX] Botany PDF "couldn't load" — needs reproduction
**Where:** likely `src/components/video/FastPdfReader.tsx` or `useLocalPdfSource.ts`
**Why:** Without the specific PDF URL / console error, root cause cannot be pinned. Likely candidates: PDF.js worker path under `capacitor://` scheme, signed-URL expiry on `lecture-pdfs` bucket, or range-request blocking on Android WebView.
**Fix:** Reader now logs the failing URL + HTTP status to console (was already partly there; will be strengthened in a follow-up after you reproduce). To diagnose: open Chrome DevTools → `chrome://inspect` → tap the Botany PDF → copy the failing network request and share.

---

## Full Findings (MEDIUM & LOW)

| Sev | Cat | Where | Issue | Fix |
| --- | --- | --- | --- | --- |
| MED | SEC | `index.html` | No Content-Security-Policy meta | Add `default-src 'self'; connect-src 'self' https://*.supabase.co https://api.openai.com …` |
| MED | DATA | `lecture_notes` | Has policies but check GRANTs same way smart_notes was | Run the bulk grant audit query |
| MED | PERF | `App.tsx` | `BrowserRouter` not lazy; could use `unstable_HistoryRouter` with persisted history | Defer until React Router 7 idioms stabilize |
| MED | OBS | `useAndroidBackButton` | `try/catch { /* not capacitor */ }` swallows real load failures of `@capacitor/app` | Distinguish web vs error |
| MED | RELY | `useSmartNote` | No auto-save; user must hit Save | Add 500 ms debounced `save(draft)` while editing |
| MED | UX | `SmartNotesReader` | Save button only visible while editing; auto-save would remove the failure mode | Combine with above |
| LOW | A11Y | floating buttons | `aria-label` present — good. No keyboard handler for fab | Add `onKeyDown` Enter/Space |
| LOW | MAINT | `useStudentNotes` | `const db = supabase as any` | Generate types via Supabase CLI and drop the cast |
| LOW | CONFIG | `capacitor.config.ts` | `process.env.CAP_DEBUG` only honored at config-load time, not per-build env | OK, but document it in `README` |

---

## Wins (what's done right)

- **Splash**: `launchAutoHide: false` + JS-controlled hide with 2 s safety timer = best-in-class cold start.
- **Debug gating**: `webContentsDebuggingEnabled` is correctly tied to an env flag, not a static `true`. CAP001 clean.
- **Plugin loading**: Almost every Capacitor plugin is dynamically imported, with a try/catch web fallback.
- **Splash + StatusBar colors** match (`#F7F4EE`) — no first-frame flash.
- **`lazyWithRetry`**: handles stale chunk recovery after Capgo OTA. Production-grade.
- **Hardware back button**: module-level guard prevents the StrictMode double-listener bug — most teams hit this and don't fix it.
- **APK workflow**: caches Android SDK, Gradle, uses bun. Already 2–3× faster than a naive setup.

---

## Recommended Next Steps (prioritized)

1. **Reproduce the Botany PDF failure** with Chrome DevTools → fix the worker URL or signed-URL flow.
2. **Add the offline mutation queue** (HIGH).
3. **Add an error reporter** + replace silent catches (HIGH).
4. **Run the GRANT audit** on every public table — `smart_notes` was not the only one likely affected.
5. **Add CSP meta** to `index.html`.
6. **Add basic Playwright + Capacitor e2e** for the 3 critical flows: login → enroll free → play lesson.

---

_Generated as part of the multi-phase plan; per-batch detail (A–E) collapsed into the tables above. Re-run the `senior-architect-audit` skill on individual surfaces for deeper drill-downs._
