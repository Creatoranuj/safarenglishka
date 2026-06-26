---
name: ios-android-logs
description: Stream and filter native device logs for the Naveen Bharat Capacitor app on Android (adb logcat / chrome://inspect) and iOS (xcrun simctl / Console.app / Safari Web Inspector). Use when the user reports a crash, white screen, "couldn't load" error, plugin failure, or asks to see device logs.
---

# iOS & Android Logs — Naveen Bharat

Fast paths to the logs that matter when something breaks on a real device or emulator.

## When to Use

- "App crashed on my phone"
- "PDF / video / lesson won't load on Android"
- "White screen on launch"
- "Plugin X is not implemented"
- Any debug session that needs ground truth from the device

## Shipped helpers in this repo

| Script | What it does |
| --- | --- |
| `scripts/logs-android.sh` | `adb logcat` filtered to `com.naveenbharat.app` + `Capacitor` tags |
| `scripts/logs-ios.sh` | `xcrun simctl spawn booted log stream` filtered to "Naveen Bharat" |

Run from repo root: `./scripts/logs-android.sh`.

## Android — the 4 commands you actually need

```bash
# 1. Confirm device is visible
adb devices

# 2. Stream Capacitor + app logs (most common)
adb logcat -s Capacitor:V CapacitorPlugin:V chromium:V "com.naveenbharat.app:V" *:E

# 3. Crash backtrace only
adb logcat *:E | grep -iE 'fatal|androidruntime|capacitor'

# 4. WebView JS console + network — Chrome DevTools
#    Open Chrome on desktop → chrome://inspect → "inspect" under the app
#    Requires CAP_DEBUG=1 at build time (capacitor.config.ts gates this)
```

## iOS — the 4 commands

```bash
# 1. List booted simulators
xcrun simctl list devices booted

# 2. Stream filtered logs from booted simulator
xcrun simctl spawn booted log stream --predicate 'process == "Naveen Bharat"' --level debug

# 3. Real device — replace UDID
xcrun devicectl device log stream --device <UDID>

# 4. WebView JS console — Safari Web Inspector
#    On device: Settings → Safari → Advanced → Web Inspector ON
#    On Mac: Safari → Develop → [device] → [Naveen Bharat]
```

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| `chrome://inspect` shows the device but no app | `webContentsDebuggingEnabled` is false in release build | Rebuild with `CAP_DEBUG=1 npm run build && npx cap sync android` |
| `adb logcat` is silent | Wrong USB mode, or device not authorized | `adb kill-server && adb start-server`; accept the RSA prompt |
| Logs scroll too fast | No filter | Always add `-s` tag filters or pipe through `grep` |
| Crash with no stack | ProGuard obfuscated the trace | Keep `android/app/build/outputs/mapping/release/mapping.txt`, run `retrace` |

## Verify

After capturing logs, you should have:
- The failing URL / API call (network panel or `adb logcat | grep -i http`)
- The JS stack trace (DevTools console)
- The native exception, if any (logcat / Console.app)

Then hand off to `debugging-capacitor` for fixes.
