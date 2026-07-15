Audit: Signed APK Smoke workflow, API 28/33/35 Maestro execution, login flow, and failure classification.

Rating: 2.5/5 — the pipeline has good guardrails, but the current repo state still misses the two most important hardening pieces: clean last-attempt classification and reliable Android 15 credential injection.

Reconciliation table

| Claim | Live state | Verdict |
|---|---|---|
| “API 28 is not present” | API 28 is present in the matrix: `api-level: 28`, Maestro `1.39.0`. | False alarm; API 28 exists but is advisory, not hard-gate. |
| “Workflow queued means smoke is hanging” | A queued job means GitHub has not assigned a runner yet; the emulator/smoke has not started. | Not an app hang unless logs show it reached the emulator step. |
| “Classifier rewrite was applied” | Current workflow still uses `grep -R` over `maestro-debug`, which can read stale/other-attempt logs and misclassify assertion failures as driver failures. | Missing / incomplete. |
| “API 28 wait was bumped to 300s” | `maestro/smoke.yaml` still shows first-paint timeout `180000`. | Missing / incomplete. |
| “API 35 avoids Maestro inputText” | API 35 split path avoids Maestro `inputText`, but uses Android clipboard/keyevent paste, which can update native text without reliably firing React controlled-input `onChange`. | Partially fixed; still fragile. |
| “Split smoke flow exists as reusable files” | `maestro/split-smoke/*.yaml` files are absent; flows are generated inside the workflow script. | Works in CI, but not reusable/debuggable locally. |
| “Only API 33 gates release” | `continue-on-error` makes only API 33 + Maestro 1.39.0 hard-gate. | Correct. |

Findings

- [HIGH] [CI/E2E] Failure classifier still reads too broad a log set  
  Where: `.github/workflows/signed-apk-smoke.yml`, current classification block.  
  Symptom: failures can keep showing as `android-driver-unreachable` even when the real failure is an app assertion, blank login, dashboard timeout, or cold-paint timeout.  
  Root: classifier greps all of `maestro-debug` instead of the final attempt’s own output, so stale attempt-1 signatures can override final failure reason.  
  Fix: classify from the last attempt log/debug directory first; prefer explicit assertion text over driver keywords.

- [HIGH] [Android 15/Login] API 35 input bypass can submit empty React state  
  Where: API 35 split smoke path in `.github/workflows/signed-apk-smoke.yml`; login inputs in `src/pages/Login.tsx`.  
  Symptom: screen may show text pasted, but React state can remain empty; submit then fails validation or never reaches dashboard.  
  Root: ADB clipboard paste/keyevent can bypass React synthetic input/change events in a controlled component.  
  Fix: add a CI-only deterministic WebView injection bridge for smoke login, or use a WebView JS dispatch path that sets input value and dispatches `input`/`change` events.

- [MEDIUM] [API 28/Timing] API 28 first-paint timeout remains 180s  
  Where: `maestro/smoke.yaml`.  
  Symptom: API 28 can fail as app assertion/cold-paint timeout on slow shared runners.  
  Root: older Chromium 66 WebView parse/first paint is slow in CI.  
  Fix: bump only the first-paint wait to 300s for smoke stability, while keeping API 28 advisory.

- [MEDIUM] [Workflow Maintainability] Split smoke flows are generated inline  
  Where: workflow writes YAML into `maestro-debug/api35-split`.  
  Symptom: local reproduction and review are harder; source files are missing.  
  Root: emergency fix was embedded in shell instead of reusable Maestro files.  
  Fix: move split flows into committed `maestro/split-smoke/` files and have CI call those.

- [LOW] [Telemetry] Rollup table lacks first failing assertion / last stderr columns  
  Where: telemetry JSON + rollup table.  
  Symptom: user sees “failed” but still has to open artifacts to know what failed.  
  Root: telemetry emits only broad `failure_class`.  
  Fix: emit `first_fail_assertion` and `last_stderr_line` in JSON + summary.

Wins

- API 28 is included and advisory, so it does not block the release.
- API 33 is the correct hard gate and still uses the normal full smoke path.
- API 35 Maestro 1.39.0 was removed from matrix; only newer A/B pins remain.
- Driver package mitigations are guarded, so `Unknown package: dev.mobile.maestro` is no longer the main issue.
- Signed APK includes `x86_64` only for smoke builds, not Play release AAB.
- Release WebView debugging remains off unless `CAP_DEBUG=1`, avoiding a production security regression.

Fix Plan

Now

1. Make failure classification deterministic.
   - Track the final attempt’s debug directory/log path.
   - Extract `first_fail_assertion` from that final attempt only.
   - Extract `last_stderr_line` from that final attempt only.
   - Classification order:
     1. exit 0 -> `pass`
     2. explicit assertion -> `app-assertion-failed`
     3. timeout/143/137/124 -> `driver-timeout-terminated`
     4. driver transport keywords in final attempt -> `android-driver-unreachable`
     5. otherwise -> `app-smoke-failed`

2. Fix API 35 credential entry at the root.
   - Stop relying on clipboard paste as the only source of truth for React controlled inputs.
   - Add a smoke-only Android JS bridge or WebView evaluation path that:
     - finds `#email` / `#password`,
     - sets the native DOM value through the input value setter,
     - dispatches bubbling `input` and `change` events,
     - verifies values are present before submit.
   - Keep this disabled in normal production runtime unless a CI smoke flag is explicitly present.

3. Make split smoke flows reusable.
   - Add committed `maestro/split-smoke/focus-email.yaml`.
   - Add committed `maestro/split-smoke/focus-password.yaml`.
   - Add committed `maestro/split-smoke/submit-and-nav.yaml`.
   - Update the workflow to use those files instead of generating YAML inline.

4. Stabilize API 28 first paint.
   - Bump initial first-paint `extendedWaitUntil` from 180s to 300s.
   - Keep API 28 advisory until multiple consecutive green runs prove it can hard-gate.

5. Improve telemetry visibility.
   - Add `first_fail_assertion` and `last_stderr_line` to `flake-telemetry.json`.
   - Add those columns to the rollup summary.
   - Add advisory warnings that say “assertion failed” vs “driver died” clearly.

Next

1. Add artifact naming per attempt for API 35 split stages: focus-email, focus-password, submit-and-nav.
2. Add a small “smoke mode” marker in the app only for CI signed APKs if needed, not in public UI.
3. Keep API 35 advisory until the same Maestro version passes repeatedly.
4. Keep API 33 as hard gate; do not expand hard gates until telemetry is stable.

Root

1. The team is missing clean observability: the current workflow can report the wrong failure class.
2. The team is missing a reliable input primitive for Android 15 WebView + React controlled inputs.
3. The team is treating advisory matrix failures as if they block release; only API 33 currently blocks.
4. The team may be interpreting GitHub “Queued” as smoke hang; queued means no runner yet.

Skill tracker deltas

- ci-e2e-error-monitor: +2 for identifying classifier drift and distinguishing advisory vs hard-gate failures.
- senior-architect-audit: +1 for separating runner queueing, driver failure, app assertion failure, and input-state failure.

Approval boundary

- HIGH edits are required for the classifier and Android 15 input primitive, so I will not apply them until you approve this plan.
- LOW telemetry cleanup can be applied with the same approved change set.