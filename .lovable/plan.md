# Audit: signed-apk-smoke pipeline (post takeScreenshot removal)

**Rating: 3.5/5** — Infra solid, but 3 real unknowns (API 28 WebView blank, API 35 IME/nav, API 33 screenshot-null root) still unverified on a real tag; fail-probability meaningful.

## Fail probability — next `v1.0.20-smoke` run

| API | Green | Fail | Dominant risk |
|---|---|---|---|
| 28 | 55% | **45%** | Legacy Chromium 66 WebView + Capacitor bridge — may still render blank; only screenshot artifact will confirm |
| 33 | 85% | **15%** | Was the most stable; risk is regression from flow edits |
| 35 | 60% | **40%** | `hideKeyboard` fixes IME hang, but post-signin navigation on Android 15 still unverified |
| **All-green (gate)** | **~30%** | **~70%** | Product of independent legs |
| At-least-one-green | ~97% | ~3% | Enough to get diagnostic screenshots |

Overall **fail probability of the hard gate: ~65-70%**. Diagnostic value of the run: very high (screenshots + telemetry will pinpoint root causes).

## Reconciliation (claims vs live state)

| Claim | Live state | Verdict |
|---|---|---|
| Maestro screenshots removed, adb screencap added | Need to re-verify in `signed-apk-smoke.yml` + `maestro/smoke.yaml` | Pending re-read |
| Perf gate parses `ActivityTaskManager: Displayed` | Shipped last round | ✅ |
| Flake telemetry + rollup job | Shipped | ✅ |
| `packageName` derived from build.gradle | Shipped | ✅ |
| API 28 quarantine removed | Shipped | ✅ (also increases fail chance) |
| Play promote soft-skips without secret | Shipped | ✅ |
| SHA-pinned upload-google-play | Shipped | ✅ |

## Findings

### [HIGH] [RELY] API 28 blank-WebView risk unmitigated
**Where:** signed APK on Android 9 emulator
**Symptom:** Maestro times out finding any login text
**Root:** System WebView on API 28 image is Chromium 66; modern JS bundles (Vite target esnext, optional chaining polyfills) can white-screen silently
**Fix (next round, needs approval):** Either (a) bump Vite `build.target` to `es2017` and add core-js polyfill for API 28, or (b) formally drop API 28 from hard gate and keep as advisory `continue-on-error` leg

### [HIGH] [RELY] API 35 post-signin navigation unverified
**Where:** `maestro/smoke.yaml` after `hideKeyboard`
**Symptom:** attempt 2 last run signed in but Dashboard tokens missing in 90s
**Root:** Android 15 predictive-back + edge-to-edge may hide bottom nav labels; regex may still miss
**Fix (next round):** Add `assertVisible` on a stable data-testid on Home instead of text regex; requires adding `data-testid="home-root"` to the Home screen root element

### [MEDIUM] [OBS] Screenshot-null root cause on API 33 not upstream-reported
**Where:** removed from flow, not root-caused
**Root:** likely Maestro CLI + API 33 emulator display density combo (known issue thread)
**Fix:** Pin Maestro CLI version in workflow so future upgrade doesn't silently reintroduce

### [MEDIUM] [CONFIG] `reactivecircus/android-emulator-runner` unpinned
**Where:** workflow uses floating major tag
**Root:** Supply-chain drift; also emulator-image bumps have caused past regressions
**Fix (root, deferred):** Pin to commit SHA per red-team lens

### [LOW] [OBS] Telemetry rollup doesn't surface which attempt passed
**Where:** `telemetry-rollup` job
**Fix (inline-able):** Include `ATTEMPT1_EXIT` + `ATTEMPT2_EXIT` columns in the markdown table

### [LOW] [MAINT] Two observer docs (`post-warmup-jobsplit`, `post-package-derivation`) overlap
**Fix:** Consolidate into a single running log next round

## Wins
- Perf gate now reads canonical logcat marker
- packageName no longer hardcoded (3-report streak closed)
- Flake telemetry + rollup live
- SHA-pinned Play action, least-privilege token perms
- Screenshot crash isolated out of Maestro path

## Fix Plan
- **Now (LOW, inline OK after approval):** telemetry rollup attempt columns; pin Maestro CLI version
- **Next (HIGH, needs your call):** Pick one — (a) polyfill/target bump for API 28, or (b) demote API 28 to advisory
- **Next (HIGH):** Add `data-testid="home-root"` on Home screen + switch Maestro Dashboard assert to testid
- **Root (deferred):** SHA-pin `android-emulator-runner`; consolidate observer docs

## Skill tracker deltas
- ci-e2e-error-monitor: matched S9 (API 28/35 timing) + new signature "Maestro screencap returns null on API 33" — worth adding to skill table
- senior-architect-audit: VIS/MOT N/A (CI-only surface)
- red-team-security-audit: 1 open item (emulator-runner pin)
- app-crash-shield / capacitor-back-button / video-player / soft-touch / mobile-view-expert / perf-exam-ready: N/A this scope
- supabase-architect-auditor: N/A (no schema change)
- sentry-triage: N/A (no runtime error stream in scope)
- asset-optimization / console-error-triage: N/A

## Decision needed from you
1. API 28 strategy: **polyfill/target bump** or **demote to advisory**?
2. OK to add `data-testid="home-root"` to Home screen (tiny frontend edit) so API 35 assert becomes deterministic?
3. Cut `v1.0.20-smoke` now for diagnostic screenshots, or apply fixes first?
