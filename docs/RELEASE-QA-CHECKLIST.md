# Phase 5 — Release QA, Debugging & Pipeline

Production-grade Android-now / iOS-later checklist. No fake credentials.

## 1. Package scripts (verified)
- `npm run build` — Vite + bundle-size gate (entry ≤ 220KB, chunk ≤ 300KB)
- `npm run lint` — ESLint
- `npm run test:e2e` — Playwright
- `npm run cap:sync` / `cap:android` / `cap:ios`
- ❌ No `typecheck` script added — TS errors surface via build/IDE; add only after a clean `tsc --noEmit` run.

## 2. Android build & sync
```bash
npm run build
npx cap sync android
npx cap open android                 # Android Studio
cd android && ./gradlew assembleDebug          # debug APK
cd android && ./gradlew bundleRelease          # release AAB (needs keystore)
```
- `versionCode` / `versionName` → `android/app/build.gradle`
- Signing config → `android/app/build.gradle` (keystore values must come from `~/.gradle/gradle.properties` or CI secrets; never commit)

## 3. Debugging & logs
```bash
adb logcat | grep -iE "capacitor|chromium|naveen"
# Chrome WebView inspector:  chrome://inspect
# App Links verify:
adb shell pm get-app-links com.naveenbharat.app
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://naveenbharat.vercel.app/course/123" com.naveenbharat.app
```
Capgo updater: filter logs by `CapgoUpdater`. Network/offline: toggle airplane mode then cold-start; expect cached shell + offline banner.

## 4. Release QA test matrix
| Area | Pass criteria |
|---|---|
| Cold start | < 2.5s to first paint, splash hides ≤ 1.5s |
| Splash | No flash, theme bg matches |
| Offline launch | App shell loads, banner shown |
| Login / session resume | Token rehydrates, no logout flash |
| Keyboard screens | CTA stays above keyboard (`.nb-hide-on-kb`) |
| Bottom nav / safe area | No notch overlap, `--sab` respected |
| Android back | Closes modal → previous route → exit prompt |
| PDF / Notes / DPP viewer | Opens, scrolls, `FLAG_SECURE` on |
| Video player | Plays, fullscreen, orientation lock |
| Razorpay | Native sheet on device, web fallback in browser |
| Deep link cold | URL opens correct route from killed state |
| Deep link warm | URL routes without restart |
| App update path | Capgo OTA & Play update both load cleanly |

## 5. Security release checklist
- ✅ `cleartext: false` (`capacitor.config.ts`)
- ✅ `android:allowBackup="false"` (`AndroidManifest.xml`)
- ✅ Debug build only via `assembleDebug`; release strips dev URL
- ✅ External links use `noopener,noreferrer` or `openExternal()` (Phase 4 O2 complete)
- ⚠️ CSP still allows `unsafe-inline`/`unsafe-eval` — future hardening
- ⚠️ Root/jailbreak detection not enforced — optional
- 📋 Play Data Safety: declare auth, payments, analytics, crash reporting

## 6. iOS future (docs-only)
- Real Apple Team ID → `apple-app-site-association` + Xcode signing
- Associated Domains entitlement: `applinks:naveenbharat.vercel.app`
- Verify AASA: `https://app-site-association.cdn-apple.com/a/v1/naveenbharat.vercel.app`
- Logs: Xcode → Devices & Simulators, or Console.app filter by `App`

## 7. Pending (do NOT fake)
1. Canonical domain decision (vercel.app vs naveenbharat.app)
2. Release keystore SHA-256 → `public/.well-known/assetlinks.json`
3. Apple Team ID → AASA
