# Workflow Audit — Safar English Ka (v1.1.1 → v1.1.2)

_2026-09-02 — all runs verified live through the GitHub API._

## 1. Why v1.1.1 / v1.1.2 release builds "failed"

Gradle was never the problem. Both run #75 and run #76 printed:

```
BUILD SUCCESSFUL in 2m 33s
453 actionable tasks: 294 executed, 159 from cache
```

…and then died with exit code 2:

```
line 45: syntax error near unexpected token `|'
line 45: `  | tee "$RAW_LOG" \'
```

A blank line had crept between `--stacktrace 2>&1 \` and `| tee`, so bash
terminated the command at the backslash and then hit a bare pipe. Fixing that
exposed the identical defect one line lower (`| tee ... \` → blank → `| grep`).
Both are now rejoined, and a guard scans every workflow for a blank line
following a `\` continuation.

**Result: run #77 — success, 223s. Release `v1.1.2` published with
`SafarEnglish-v1.1.2.apk`, `SafarEnglish.apk`, `web-bundle.zip`.**

## 2. Where the build time was going

| Phase | Before | After | Why |
| --- | --- | --- | --- |
| Gradle wrapper / SDK / config | ~180s cold every tag | restored from warm cache | Actions cache is **ref-scoped** — a tag run can never read another tag's cache, so every release build was 100% cold and its 43–66s post-job save was thrown away. `warm-android-cache.yml` seeds the same keys on `main` + daily; `build-apk.yml` now only `cache/restore`s. |
| `:app:bundleRelease` | always | only when `PLAY_SERVICE_ACCOUNT_JSON` is set | ~60–90s saved; the AAB was uploaded as a 1-day artifact and deleted. |
| Java compile regression | caught only at tag time | `android-compile-guard.yml` on every `android/**` change | `MainActivity.onResume()` was `protected` vs `public` in `BridgeActivity`. |

End-to-end release build: **~5.5–6 min → 3m 43s (223s)**.

## 3. Workflow status (latest run of each)

| Workflow | Run | Result | Notes |
| --- | --- | --- | --- |
| Safar English (build-apk) | #77 | ✅ 223s | fixed this session |
| Android Compile Guard | #2 | ✅ 208s | new guard |
| Warm Android Cache | #2 | ✅ 333s | seeds the shared cache |
| Code Guards | #13 | ✅ 19s | |
| Enrollment Bypass Regression | #46 | ✅ 31s | RLS test fixed |
| Playwright E2E | #13 | ✅ 53s | |
| Flake Trend Aggregator | #41 | ✅ 11s | |
| Supabase Keepalive | #13 | ✅ 10s | now queries `/rest/v1/courses` (real DB touch) |
| PDF + Notion Edge Keepalive | #1100 | ✅ 9s | |
| Dependency Security Audit | #10 | ❌ 17s | see below |
| Maestro Android E2E | #43 | ❌ 46s | `chmod +x android/gradlew` added; re-run in flight |
| Razorpay Smoke | #35 | ❌ 10s | **not a code bug** — `RAZORPAY_KEY_SECRET` is rotated/invalid (HTTP 401 `Authentication failed`). Only the repo owner can replace the secret. |
| Lighthouse CI | #54 | ❌ stale | auto-trigger intentionally disabled 2026-07-19 |
| Signed APK Smoke | #50 | ❌ stale | auto-trigger intentionally disabled 2026-07-19 |

## 4. Dependency Security Audit

`postcss` was bumped to `^8.5.26`, clearing its HIGH advisory. Remaining
`dompurify` findings are LOW/MODERATE and informational only. The step that
actually failed was **orphan detection**: `ai-health` (ops/uptime probe) and
`fetch-youtube-transcript` (called server-side from
`supabase/functions/resolve-doubt/index.ts`, never from `src/`) have no UI
caller by design. Both are now in `BACKEND_ONLY_ALLOWLIST` —
`called=30 backend-only=11 orphaned=0`.

Still open and owner-actionable: the `react-router` advisories
(GHSA-wrjc-x8rr-h8h6, GHSA-h8fp-f39c-q6mh, GHSA-337j-9hxr-rhxg) need a
react-router major bump, which touches routing across the app — do it as its
own change, not inside a release build.

## 5. Is this useful?

Yes, with one caveat. The high-value workflows are `build-apk`,
`android-compile-guard`, `code-guards`, `enrollment-bypass`, and
`playwright-e2e` — each one has caught a real defect. `warm-android-cache`
pays for itself on every tag. The two keepalives are cheap insurance against
Supabase auto-pause.

The low-value ones are the two intentionally disabled workflows
(`lighthouse-ci`, `signed-apk-smoke`) — they sit permanently red in the
Actions list and make real failures harder to spot. Either delete them or
leave them dispatch-only with a note; a red badge that everyone learns to
ignore is worse than no badge.

## 6. White-strip verification

The CSS/native fix is in `v1.1.2`. Final confirmation requires installing
`SafarEnglish-v1.1.2.apk` from the release on a physical device and opening a
Library PDF in both portrait and landscape — the strip is the Android system
status bar repainting over the WebView, so it cannot be reproduced in a
browser preview.
