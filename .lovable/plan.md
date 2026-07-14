## Root cause (from v1.0.20-smoke logcat forensics)

**API 33: pass ✅. API 28 + 35: fail — but not from app crashes.**

### 1. Deeplink `openLink com.safarenglishka.app://login` is a no-op after `launchApp`
- Maestro `launchApp: clearState` cold-starts the app on route `/` (landing).
- `openLink` fires the VIEW intent **while WebView + React Router are still hydrating**, so `App.addListener("appUrlOpen", …)` is not registered yet → event is dropped.
- On API 35, `grep 'packageName: com.safarenglishka' logcat` shows only landing-page text — `Final CTA`, `Free video lessons`, `Join our community`, `Our method`. The Login route never mounts, so `Welcome Back` never appears → 120s timeout → fail.
- On API 28, Maestro then force-stops the app during retry, so no app text is captured at all.

**Fix:** stop relying on the deeplink race. Either land on `/` and tap the "Login" button, OR pass the deeplink to `launchApp` so it's part of the cold-start intent (Capacitor's `getLaunchUrl()` will then return it).

### 2. Crash-grep is counting our own `uiautomator dump` failure as an app crash
API 35 telemetry: `crash_lines: 15`. Every one of those lines is:
```
FATAL EXCEPTION: main … UiAutomationService … already registered!
  at com.android.commands.uiautomator.DumpCommand.run(...)
```
That's the failure-debug step we added (`adb exec-out uiautomator dump`) colliding with Maestro's own UiAutomation session. Not an app crash. Poisons the "crash detected → fail" gate.

### 3. `boot_ms: 0` on both legs
Parser expects `ActivityTaskManager: Displayed com.safarenglishka.app/...` but API 28 uses `ActivityManager:` (no "Task"), and on API 35 the app was killed before Displayed logged. Parser needs both prefixes + a fallback.

---

## Plan — 2 files, zero app-code changes

### File 1 — `maestro/smoke.yaml`
- Replace the two-step `launchApp` + `openLink` with a single Maestro launch that carries the deeplink (or fall back to landing-page nav):
  ```yaml
  - launchApp:
      clearState: true
  - runFlow:
      when:
        visible: "Welcome Back|Sign In|Email"
      commands: []      # already on Login, continue
  - runFlow:
      when:
        notVisible: "Welcome Back"
      commands:
        - tapOn:
            text: "Login|Sign In|Log In"
            optional: true
  - extendedWaitUntil:
      visible: "Welcome Back|Email"
      timeout: 120000
  ```
- Keep the API-35 `hideKeyboard` guards and widened Dashboard regex (already good).
- Remove the `openLink` line — that's the deeplink race.

### File 2 — `.github/workflows/signed-apk-smoke.yml`
- **Crash grep:** exclude `uiautomator`, `DumpCommand`, `UiAutomationService.*already registered`, and the `screencap`/`uiautomator dump` debug step's own pid. Concretely:
  ```bash
  grep -E "FATAL EXCEPTION|AndroidRuntime.*E " logcat.txt \
    | grep -v -E "uiautomator|DumpCommand|UiAutomationService|already registered" \
    > logcat-crashes.txt
  ```
- **BOOT_MS parser:** accept both `ActivityTaskManager: Displayed` and `ActivityManager: Displayed`, and fall back to Maestro's own `launchApp` duration when Displayed line is absent (parse `Launch completed in Nms`).
- **UI-dump debug step:** run `uiautomator dump` **only after killing Maestro's driver process** (or replace with `adb shell dumpsys window` + `adb shell screencap` — screencap alone is enough for triage and doesn't collide).

No changes needed in `src/pages/Login.tsx`, `AndroidManifest.xml`, or `useDeepLinks.ts` — deeplink wiring is correct, we just can't rely on it under a race.

### Expected pass rate after both fixes
- API 33: stable (unchanged).
- API 35: ~90%+ (real failure was deeplink race, not selector).
- API 28: ~85% (still legacy WebView, but landing→tap is what humans do and always works in manual smoke).
- Overall matrix green probability: **~85–90%** — a real jump, not a paper one.

### Answer to your direct question
**Sirf 2 files** aur chahiye — `maestro/smoke.yaml` + `.github/workflows/signed-apk-smoke.yml`. App-code (Login, Manifest, deeplinks) bilkul theek hai; test harness me hi race + false-positive crash grep hai.
