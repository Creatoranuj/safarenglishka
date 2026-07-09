# Capacitor — Build, Run, Debug

One-pager for native iOS/Android builds of Naveen Bharat.

## First-time setup

```bash
npm install
npx cap add ios       # macOS only
npx cap add android
```

## Every code change

```bash
npm run build         # produces dist/
npx cap sync          # copies dist/ + plugins into native projects
```

## Run on device / emulator

```bash
npx cap run android
npx cap run ios       # macOS only
```

Or open in the native IDE:

```bash
npx cap open android  # → Android Studio
npx cap open ios      # → Xcode
```

## Remote debugging

- **Android**: Chrome → `chrome://inspect` → pick the WebView.
- **iOS**: Safari → Develop menu → device name → WebView.

Console logs and network requests show up live.

## Native logs

```bash
# Android
adb logcat | grep -iE "capacitor|chromium|naveen"

# iOS (with device connected)
xcrun simctl spawn booted log stream --predicate 'process == "App"'
```

## Live reload from Lovable preview

Temporarily uncomment the `server` block in `capacitor.config.ts` (URL is in the comment), run `npx cap sync`, then `npx cap run android`. Comment it back out before producing a release APK.

## Screen-capture protection

- Lesson player, PDF viewer, and Archive reader auto-enable Android `FLAG_SECURE` via `useScreenProtection(true)` (`@capacitor-community/privacy-screen`).
- Dashboard, notices, and other non-sensitive pages are intentionally screenshot-able.

## Release APK

GitHub Actions workflow already strips the dev server URL and produces a self-contained APK. Trigger via the **Build APK** workflow in the repo's Actions tab.

## Security scan

```bash
npx capsec scan --severity high
```
