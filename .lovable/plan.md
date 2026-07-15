## Current API 35 finding

This failure is no longer the old `Unknown package: dev.mobile.maestro` problem. The new snippet shows the guarded-driver fix is active:

- `Maestro driver before attempt 2: absent`
- `dev.mobile.maestro not installed yet; skipping driver package mitigations`

The real blocker now is Maestro's Android driver dying during the flow:

- `[Failed] smoke ... (Android driver unreachable)`
- earlier log evidence for this class: `inputText call failed ... DEADLINE_EXCEEDED`

GitHub Maestro issue/PR evidence points at Android 15/16 `inputText` going through the UiAutomation/gRPC path and hanging; upstream fixes replace this with direct `adb shell input` injection. Until a released Maestro version includes that fix, API 35 must bypass Maestro `inputText`.

## Fix applied

1. `.github/workflows/signed-apk-smoke.yml`
   - API 35 now uses a split smoke path:
     - Maestro only focuses the email field.
     - CI pastes the email with ADB clipboard / `adb shell input text` fallback.
     - Maestro only focuses the password field.
     - CI pastes the password with the same ADB path.
     - Maestro resumes submit + dashboard/nav assertions.
   - API 28/33 still use the original `maestro/smoke.yaml` unchanged.
   - Retry no longer uninstalls `dev.mobile.maestro` on API 35; it preserves the driver package so attempt 2 can receive standby/deviceidle mitigations before the next flow.
   - Telemetry now classifies `Android driver unreachable`, `DEADLINE_EXCEEDED`, `UNAVAILABLE`, and `Screenshot returned null` as `android-driver-unreachable`.

## Expected result

Next API 35 run should stop failing at Maestro `inputText` / driver unreachable. If it still fails, the artifact should now expose a cleaner UI assertion failure after login/navigation rather than the driver transport dying.

Used the ci-e2e-error-monitor skill.