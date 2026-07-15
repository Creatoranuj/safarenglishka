## Finding

This run is not an app crash: `logcat-crashes.txt` is empty and telemetry says `crash_lines: 0`.

Two separate issues are visible:

1. **Workflow still used stale API 35 driver mitigation** in this uploaded run:
   - `Unknown package: dev.mobile.maestro`
   - `Cannot set standby bucket for non existent package`
   - `No UID for dev.mobile.maestro`
   This means the run/artifact is from before the latest guarded-driver edit, or CI did not pick up that commit/tag yet.

2. **New logcat signal:** after app launch, WebView repeatedly logs:
   - `A WebView method was called on thread 'JavaBridge'`
   - stack points to `com.safarenglishka.app.ImmersiveBridge.isTrustedOrigin`
   - exact bad call is `b.getWebView().getUrl()` from a `@JavascriptInterface` method.

`@JavascriptInterface` methods run on Android's JavaBridge thread, not the UI thread. Calling `WebView.getUrl()` there is invalid and spams wrong-thread violations every ~6s while Maestro is waiting. On API 35 this can starve/noise the WebView/driver enough that Maestro never sees the first-paint text, even though Android reports `Displayed com.safarenglishka.app/.MainActivity: +2s962ms`.

## Fix plan

1. **Patch `android/app/src/main/java/com/safarenglishka/app/MainActivity.java`**
   - Move the origin check off `WebView.getUrl()` from the JavaBridge thread.
   - Cache the current trusted-origin state on the UI thread via a `WebViewClient.onPageStarted/onPageFinished` wrapper.
   - Preserve Capacitor's existing `WebViewClient` behavior by delegating to the original client.
   - Make `ImmersiveBridge.enter()` / `exit()` read only the cached boolean, then dispatch UI work through `MainActivity.enterImmersive()` / `exitImmersive()`.

2. **Keep security behavior intact**
   - Still allow only first-party origins:
     - `https://localhost`
     - `capacitor://localhost`
     - `http://localhost`
     - Safar English production domains already listed in the file.
   - Do not remove the origin gate; only make it thread-safe.

3. **Patch `.github/workflows/signed-apk-smoke.yml` defensively**
   - Update stale comments/log text so API35 app vs driver mitigation is unambiguous.
   - Ensure pre-Maestro path never prints `Applying API 35 Maestro-driver mitigations` unless `pm path dev.mobile.maestro` succeeds.
   - Add a quick `adb shell pm path dev.mobile.maestro` debug line before/after Maestro attempt so future logs prove whether driver mitigation was skipped or applied.

4. **Patch `.lovable/plan.md`**
   - Record the new logcat root cause and validation checklist.

5. **Validate**
   - YAML parse for `.github/workflows/signed-apk-smoke.yml`.
   - Source scan confirms no direct `getWebView().getUrl()` call remains inside `@JavascriptInterface` execution path.

## Expected result

Next `smoke (API 35 · maestro 1.40.3)` should no longer show:

- `Unknown package: dev.mobile.maestro`
- `No UID for dev.mobile.maestro`
- `WebView method was called on thread 'JavaBridge'`

With those removed, the first-paint assertion should become stable and the **Boot emulator + install SIGNED APK + smoke test** step should pass or fail with a much cleaner real UI assertion if another issue remains.

Used the ci-e2e-error-monitor skill.

## After implementation

- `MainActivity.ImmersiveBridge` no longer calls `WebView.getUrl()` directly on Android's JavaBridge thread; origin validation now runs on the UI thread before immersive mode toggles.
- API 35 CI logs now print whether `dev.mobile.maestro` exists before each Maestro attempt, and driver mitigations only run after that package is present.
- Re-run the same `smoke (API 35 · maestro 1.40.3)` leg and confirm the log no longer contains `Unknown package: dev.mobile.maestro`, `No UID for dev.mobile.maestro`, or `WebView method was called on thread 'JavaBridge'`.