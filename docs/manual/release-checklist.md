# Release checklist

## Pehle (green banane ke liye)

- [ ] `bun x tsgo --noEmit -p tsconfig.app.json` clean
- [ ] `bun run test` pass
- [ ] `bun run build` pass
- [ ] `npx cap sync android` clean
- [ ] `ai-health` → `{"ok":true}` (warna chatbot degraded mode me rahega)
- [ ] Razorpay test payment ek baar real device par
- [ ] Console clean (`console-error-triage` pass)

## Tag

- Numeric versionName. Latest: `v1.2.0-polish` → naya: **`v1.3.0`**
- `android/app/build.gradle` non-numeric chars strip karta hai — tag me `v` theek hai,
  par `APP_VERSION_NAME` numeric bhejein.

## Release

1. Tag push → `build-apk.yml` chalti hai.
2. Release notes: kya badla, kya park hua, kya admin ko karna hai.
3. Debug APK attach.

## Baad me

- [ ] APK install karke smoke: login → dashboard → course → PDF → payment
- [ ] Sentry 24h dekhein — naya top issue to nahi
