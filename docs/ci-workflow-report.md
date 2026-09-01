# CI / GitHub Actions Report — `Creatoranuj/safarenglishka`

Generated: 2026-09-01 · Source: GitHub Actions API, **all 1,427 runs** in the repo's retained history.
Durations are wall-clock (`run_started_at` → `updated_at`) per run, summed per workflow. Wall clock ≥ billable minutes for matrix jobs, so treat totals as an upper bound.

## Headline numbers

| Metric | Value |
| --- | --- |
| Total runs | **1,427** |
| Succeeded | **1,261** (88.4%) |
| Failed | **163** (11.4%) |
| Cancelled | 3 |
| Total wall-clock time | **≈ 22 h 05 m** |
| Workflows | 15 distinct names |

Failures are **not spread evenly**. Four workflows produce 126 of the 163 failures (77%), and three of them have *never* passed.

## Per-workflow breakdown

| Workflow | Runs | Pass | Fail | Pass % | Total time | Avg |
| --- | --- | --- | --- | --- | --- | --- |
| Signed APK Smoke | 35 | 3 | 31 | **8.6%** | 7 h 21 m | 12 m 36 s |
| PDF + Notion Edge Keepalive | 1,093 | 1,091 | 2 | 99.8% | 5 h 36 m | 18 s |
| Safar English (build APK + release) | 62 | 56 | 6 | 90.3% | 4 h 58 m | 4 m 48 s |
| Maestro Android E2E | 41 | 0 | 41 | **0.0%** | 1 h 38 m | 2 m 23 s |
| Lighthouse CI | 53 | 44 | 8 | 83.0% | 1 h 35 m | 1 m 48 s |
| Enrollment Bypass Regression | 40 | 0 | 40 | **0.0%** | 21 m 30 s | 32 s |
| Flake Trend Aggregator | 40 | 40 | 0 | 100% | 11 m 14 s | 16 s |
| Razorpay Smoke (test mode) | 34 | 20 | 14 | 58.8% | 6 m 12 s | 10 s |
| Playwright E2E | 4 | 2 | 2 | 50% | 6 m 08 s | 1 m 32 s |
| Naveen Bharat | 1 | 1 | 0 | 100% | 4 m 10 s | 4 m 10 s |
| Dependency Security Audit | 8 | 2 | 6 | 25% | 2 m 32 s | 19 s |
| **Supabase Keepalive** | 12 | 0 | 12 | **0.0%** | 1 m 47 s | 8 s |
| Build Signed APK | 1 | 0 | 1 | 0% | 54 s | 54 s |
| Code Guards | 2 | 2 | 0 | 100% | 40 s | 20 s |
| Maestro Smoke (Android) | 1 | 0 | 0 | — | cancelled | — |

## What is actually broken

Failing step names taken from the newest failed run of each workflow.

1. **Supabase Keepalive — 12/12 failed (issues #5–#12).**
   The ping targeted the PostgREST root `/rest/v1/`, which Supabase now restricts to *secret* keys; with the anon key it returns `401 "Only secret API keys can be used for this endpoint"`. Every 5 days the run failed and filed a **new** issue → 8+ duplicate issues.
   **Fixed** in `.github/workflows/supabase-keepalive.yml`: the check is now a read-only single-row read of `site_stats` (verified `200 OK` with the anon key), with 3 retries for transient errors, fail-fast messaging on 401/403/404, and issue **deduplication** (comments on the existing open `keepalive` issue instead of opening new ones). `actions/github-script` bumped to `@v8`.

2. **Maestro Android E2E — 41/41 failed.** Fails at `🏗️ Build debug APK`, i.e. it never reaches the emulator/tests. Every run since it was added has failed; effectively 1 h 38 m of CI burned for zero signal. Recommend fixing the debug-APK step or disabling the schedule until it is green.

3. **Enrollment Bypass Regression — 40/40 failed.** Fails at `Run enrollment-bypass integration test` after ~32 s — most likely missing Supabase secrets/service-role env in the runner, since the same probe logic passes locally. This is a *security* regression gate that has never actually gated anything.

4. **Razorpay Smoke — 14/34 failed.** Fails at `Razorpay API key pair is valid (create ₹1 test order)`. Pattern is consistent with expired/rotated test keys in repo secrets.

5. **Signed APK Smoke — 31/35 failed, 7 h 21 m (the single most expensive workflow).** Fails at `🤖 Boot emulator + install SIGNED APK + smoke test`. Emulator boot on GitHub-hosted runners is the classic flake source; the matrix (API 33 · maestro 1.39.0) plus the two follow-up jobs means each failure costs ~12 m.

6. **Dependency Security Audit — 6/8 failed** at `Verify OSV findings against lockfile`, and **Lighthouse CI — 8/53** at `Run Lighthouse CI` (perf budget).

## Where the time goes

- `PDF + Notion Edge Keepalive` runs 1,093 times (18 s each) — cheap per run, but 5 h 36 m total and 77% of all runs in the repo. If a 15-minute cron isn't required, widening it to hourly cuts ~4 h.
- `Signed APK Smoke` + `Safar English` + `Maestro Android E2E` = **13 h 57 m (63%)** of all CI time, and two of the three are mostly red.
- Practical saving available today: fix or pause the three 0%-pass workflows (≈2 h) and stabilise the emulator smoke (≈6 h of wasted runs).

## Recommended order of work

1. Merge the keepalive fix (done in this branch) and close the duplicate issues #5–#12.
2. Refresh Razorpay test secrets; add Supabase env to the enrollment-bypass job.
3. Fix or disable `Maestro Android E2E` and `Signed APK Smoke` until green — a permanently red gate teaches everyone to ignore CI.
4. Reduce keepalive cron frequency.
