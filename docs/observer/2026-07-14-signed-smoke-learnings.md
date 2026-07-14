# Signed APK Smoke — Learnings & Mistake Log

**Purpose:** Har failure jo humne face kiya, uska root cause + exact fix + guardrail. Naya CI/Maestro edit karne se pehle ye padhna mandatory hai — same mistake dubara mat karna.

Last updated: 2026-07-14 (after Run #20 GREEN, expanded P0 smoke coverage)

---

## Runbook: agar signed smoke fail ho toh

1. `Actions → Signed APK Smoke → <failed run> → job-logs.txt` download karo.
2. `grep -nE "##\[error\]|BUILD FAILED|Failed to install|\[Failed\]|Illegal option" job-logs.txt` — asli failure line dhundo (boot noise ignore).
3. Neeche wale table me signature match karo → exact fix apply karo.
4. Local se `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/signed-apk-smoke.yml','utf8'))"` chalao — YAML valid hai confirm.
5. Tag rotate → push → 7-9 min me green expect.

---

## Failure log (chronological — Run #14 → #20)

### #1 — KeytoolException: keystore secrets don't match (Run #14, #15)
- **Signature:** `Failed to read key ... from store ... keystore was tampered with, or password was incorrect`
- **Root cause:** GitHub Secrets me copy-paste karte waqt space/newline aa gaya tha; ya secrets `ANDROID_*` prefix ke saath the (workflow expects raw `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`).
- **Fix:** Fresh keystore generate (`keytool -genkey ...`), `base64 -w0 release.keystore | pbcopy`, secret me paste bina line-break. Alias/password exactly match kare.
- **Guardrail:** Workflow me "Decode signing keystore" step ab `bytes` count log karta hai — mismatch turant dikhega.

### #2 — Emulator: `adb: device 'emulator-5554' not found` (Run #16 old)
- **Signature:** macOS runner par emulator loop, 15 min baad timeout.
- **Root cause:** GitHub macOS runners par HVF virtualization reliably expose nahi hota `android-emulator-runner` ko.
- **Fix:** `runs-on: ubuntu-latest` + explicit "Enable KVM" udev step.
- **Guardrail:** **NEVER** revert to `macos-latest` for emulator jobs. Ubuntu + KVM = 2 min boot vs macOS 15 min flake.

### #3 — YAML: "Invalid workflow file — duplicate 'if' key"
- **Signature:** GitHub UI: workflow won't even start.
- **Root cause:** `logcat` upload + `Cleanup keystore` steps ek block me merge ho gaye the.
- **Fix:** Har `if: always()` ek step ka apna hona chahiye. Splits mandatory.
- **Guardrail:** Har edit ke baad `node -e "require('js-yaml').load(...)"` chalao (Python `yaml` sandbox me nahi hai; node use karo).

### #4 — Shell: `set: Illegal option -o pipefail` (S1 signature)
- **Signature:** Step exits at line 1 with code 2; log shows `/usr/bin/sh: 1: set: Illegal option -o pipefail`.
- **Root cause:** `reactivecircus/android-emulator-runner` `script:` ko `sh` (dash on Ubuntu) me chalata hai. `pipefail` bash-only hai.
- **Fix:** Do options —
  - (a) `set -e` only, POSIX syntax rakho, ya
  - (b) Staged file: `cat > /tmp/smoke.sh <<'EOF' #!/usr/bin/env bash ... EOF` phir `script: bash /tmp/smoke.sh`.
- **Current choice:** (b) — pipefail chahiye tha crash filter ke liye.
- **Guardrail:** Emulator step ka `script:` field me kabhi `[[`, `pipefail`, `source`, arrays, `local` mat likho. Sab kuch `/tmp/smoke.sh` me bhejo.

### #5 — Subshell variable loss (Run #16)
- **Signature:** `APK=$(find ...)` empty tha next line pe.
- **Root cause:** Runner `script:` ki har line ko naye `sh -c` ke andar execute karta hai — variables persist nahi karte.
- **Fix:** Same as #4 — staged `/tmp/smoke.sh` file, single `bash /tmp/smoke.sh` invocation.

### #6 — `INSTALL_FAILED_NO_MATCHING_ABIS` (Run #17)
- **Signature:** APK install fails on x86_64 emulator; APK me sirf arm64 splits hain.
- **Root cause:** Release build `ndk.abiFilters "arm64-v8a", "armeabi-v7a"` hardcode kar raha tha (ship-optimized).
- **Fix:**
  - `android/app/build.gradle` — `System.getenv("ANDROID_ABI_FILTERS")` honor karo.
  - CI workflow me `ANDROID_ABI_FILTERS: "arm64-v8a,armeabi-v7a,x86_64"` inject karo (sirf smoke build ke liye widen).
- **Guardrail:** Kabhi `build.gradle` me `abiFilters` hardcode mat karo — env override rakho.

### #7 — Maestro YAML: `Unknown property: timeout` under `assertVisible` (Run #18)
- **Signature:** `[Failed] smoke (2m 31s)` with `Unknown Property: timeout` inside flow parse.
- **Root cause:** `assertVisible` supports `text`/`id`/etc., **not** `timeout`. Wait karna hai toh `extendedWaitUntil` use karo.
- **Fix:** Har `assertVisible: X` with timeout → `extendedWaitUntil: { visible: X, timeout: N }`.
- **Guardrail:** Reference: https://maestro.mobile.dev/api-reference/commands/extendedwaituntil. Har new Maestro flow local `maestro test --dry-run` se validate karo.

### #8 — Maestro flow timeout mid-flow (Run #19)
- **Signature:** Emulator booted, APK installed, but `[Failed] smoke (2m 31s)` — assertion never met.
- **Root causes (multiple, all fixed):**
  - Casing: flow `Sign in` tap kar raha tha, app text `Sign In` hai.
  - Focus: `inputText` bina email field pe tap kiye chala — WebView me focus lost.
  - Selector brittleness: `assertVisible: Dashboard` — actual dashboard me "Dashboard" text nahi tha, "Quick Actions" / "All Classes" tha.
  - Env: Maestro env vars implicit the — `--env MAESTRO_EMAIL=... --env MAESTRO_PASSWORD=...` pass nahi ho rahe the reliably.
- **Fix:**
  - Explicit `tapOn: { id: "email" }` before `inputText`.
  - Multiple visible-text options via regex-like `|` in `extendedWaitUntil.visible`.
  - Workflow me `--env MAESTRO_EMAIL="$MAESTRO_EMAIL"` explicit.
  - `--debug-output maestro-debug --flatten-debug-output` add — failure pe screenshots+logs upload.
- **Guardrail:** Naya assertion likhne se pehle actual app string check karo (`grep` src/pages), placeholder text pe assertion mat karo.

### #9 — Blind failures (no screenshots)
- **Signature:** "Flow Failed" but koi visual proof nahi.
- **Fix:** `--debug-output` + `--flatten-debug-output` mandatory. `maestro-debug/` artifact upload karo (already done).

---

## Guardrails / Do NOT touch

| Rule | Why |
|---|---|
| `runs-on: ubuntu-latest` for emulator | KVM = fast boot. macOS = flake. |
| `arch: x86_64` + `ANDROID_ABI_FILTERS` include `x86_64` | Emulator ABI match. |
| Staged `/tmp/smoke.sh` with `#!/usr/bin/env bash` | Dash-safety (S1). |
| Explicit `--env MAESTRO_EMAIL/PASSWORD` on maestro CLI | Secret propagation. |
| `extendedWaitUntil` for timed asserts, never `assertVisible: {timeout}` | Maestro syntax. |
| `actions/upload-artifact@v6` (Node 24) | v5 deprecated. |
| `JAVA_VERSION: '21'` env var | Capacitor 6 pins Java 21. |
| `emulator-boot-timeout: 600` | Cold boot legit takes ~50-70s on Ubuntu. |
| `.yml` change → node js-yaml validate before commit | Duplicate-key catches. |
| App text change → smoke.yaml pe corresponding `visible:` update | Regression prevention. |

---

## When adding a NEW Maestro assertion

1. `rg "<expected text>" src/` — confirm exact casing, no i18n variance.
2. Use `id:` if `data-testid` / `id` attribute exists on the element (more stable than text).
3. Wrap non-critical steps with `optional: true` — but never the assertion the flow exists to prove.
4. Local dry run before push: `maestro test --dry-run maestro/smoke.yaml`.

---

## Verified GREEN state (Run #20)

- Boot: 49s ✅
- Install: `Streamed Install → Success` ✅
- Login → Dashboard → Back → Exit hint ✅
- Total: 7m 30s ✅
- Logcat: 0 `FATAL EXCEPTION`, 0 `ANR` ✅

---

## P1 shipped — 2026-07-14

**(c) API-level matrix.** `signed-apk-smoke.yml` now runs on API 28 / 33 / 35 in parallel (`strategy.matrix.api-level`, `fail-fast: false`). Each leg boots its own AVD (cache is per api-level in `android-emulator-runner`), installs the same signed release APK, runs the full smoke + pdf-back + back-button-cold-start chain, and uploads its own artifacts (`signed-smoke-logcat-api<N>`, `signed-apk-smoke-report-api<N>`, `gradle-build-reports-signed-api<N>`) — v6 rejects duplicate artifact names, so the api-level suffix is mandatory.

Why 28 / 33 / 35: Android 9 (WebView diffs, oldest Play-supported floor for most SDKs), Android 13 (baseline — matches Run #20 green), Android 15 (predictive back gesture + new scoped-storage). Covers the three surfaces where release-only regressions historically hide.

Cost: ~3× runner minutes per tag (~24 min wall-clock parallel, was ~8 min single). Still under the 60-min job timeout.

**(d) Perf regression hard-gate.** Boot-time grep is no longer a pure warning:

- `> 120000 ms` → `::error::` + `exit 1` (tag blocked)
- `> 75000 ms` → `::warning::` (visible in Actions summary, non-blocking)
- ≤ 75s → silent pass

Threshold rationale: Run #20 measured 49s on API 33. API 28 x86_64 boots slower (~65-80s typical), so 75s soft / 120s hard leaves headroom without letting a real regression (splash-hider stall, JS parse blowup, WebView init hang) sneak through.

**Guardrail added:** any new artifact upload in this workflow MUST include `-api${{ matrix.api-level }}` in the name.


---

## P2 shipped — 2026-07-14 (auto-promote to Play internal)

**New job:** `promote-to-play` in `signed-apk-smoke.yml`, `needs: smoke-signed-apk`. Runs only when **all** matrix legs (API 28/33/35) pass green AND the trigger is a real tag push (`refs/tags/v*`) — `workflow_dispatch` smoke runs never touch Play.

**Soft-skip guard:** first step checks `PLAY_SERVICE_ACCOUNT_JSON`. Missing → `::warning::` + `skip=true` output → every subsequent step is skipped via `if: steps.gate.outputs.skip != 'true'`. This lets contributors without Play access still ship tags; the job just logs "add the secret to enable auto-promote".

**AAB build (not APK):** `./gradlew bundleRelease` (Play requires .aab since 2021). ABI filters left at production default (`arm64-v8a, armeabi-v7a`) — the `x86_64` widening from the smoke build is deliberately NOT reused here (would bloat the upload and Play may reject).

**Upload:** `r0adkll/upload-google-play@v1` with:
- `packageName: com.safarenglishka.app` (matches `applicationId` in `android/app/build.gradle:13`)
- `track: internal`
- `status: draft` — **key decision**. Draft means the release lands in Play Console but does NOT roll out to testers until a human clicks "Review release" → "Start rollout". Human-in-the-loop kill switch. Flip to `status: completed` only after the pipeline has shipped ~10 tags cleanly.
- `whatsNewDirectory: distribution/whatsnew` (already exists with `whatsnew-en-US`)
- `mappingFile: mapping.txt` — ProGuard mapping uploaded so Play Console de-obfuscates ANRs/crashes

**Guardrails baked in:**
- Keystore always removed in `if: always()` cleanup, even on upload failure
- AAB uploaded as artifact (`signed-aab-<tag>`, 30-day retention) for offline verification
- No dependency on smoke build's APK artifact — job builds fresh from source so an artifact-tampering attack can't push a different bundle than what was tested

**Required new secret:** `PLAY_SERVICE_ACCOUNT_JSON` — service account JSON from Play Console → API access → grant "Release manager" role on the app. Paste the entire JSON blob (not the file path).

**End-to-end tag flow now:**
1. `git push origin v1.0.19`
2. Signed APK builds (~4 min)
3. 3× emulator legs run in parallel (~20 min)
4. All green → AAB builds + uploads to Play internal as draft (~6 min)
5. Reviewer opens Play Console, clicks "Start rollout" for internal testers
6. Total elapsed hands-off: ~30 min, zero manual APK handling

