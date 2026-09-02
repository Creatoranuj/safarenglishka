# CI build analysis — v1.1.1 (Android APK workflow)

## What actually happened

- **v1.1.1 never produced an APK.** It failed at
  `:app:compileReleaseJavaWithJavac`:
  `MainActivity.java:183: error: onResume() in MainActivity cannot override
  onResume() in BridgeActivity — attempting to assign weaker access
  privileges; was public`. Fixed by making the override `public`.
- **Every tag build is 100% cold.** The v1.1.0 log shows
  `Cache not found for input keys` for the Gradle wrapper, the Gradle
  build-cache, the Android SDK, and the Vite cache. Reason: GitHub Actions
  cache entries are **ref-scoped** — a cache saved on `refs/tags/v1.1.0`
  can never be read by `refs/tags/v1.1.1`. Only default-branch caches are
  shared across refs. The workflow only triggers on tags, so it was saving
  caches that nothing would ever restore.

## Where the time went

| Phase | Cost | Note |
| --- | --- | --- |
| Gradle wrapper download + JVM start | ~30s | cold every run |
| Android SDK 35 + build-tools install | ~60s | cold every run |
| Gradle configuration | ~90s | no configuration cache |
| Gradle execution (dex/R8/package) | ~90s | no build-cache hits |
| `:app:bundleRelease` (AAB) | ~60-90s | artifact deleted after 1 day when no Play creds |
| Post-job cache saves | ~43-66s | unreadable by any future run |

## Changes made

1. `MainActivity.onResume()` → `public` (unblocks the release build).
2. New `warm-android-cache.yml` — runs on `main` + daily, saves the **exact
   same cache keys** from the default branch so tag builds can restore them.
   Includes an `assembleDebug` run to populate the shared dex/resource
   build-cache.
3. `build-apk.yml` cache steps switched to `actions/cache/restore@v5`
   (wrapper, build-cache, Android SDK, Vite) — restore the warm entries,
   skip the dead post-job save.
4. `:app:bundleRelease` now runs only when `PLAY_SERVICE_ACCOUNT_JSON` is
   configured; otherwise the AAB was built and thrown away.
5. New `android-compile-guard.yml` — compiles the native Java sources on
   every `android/**` change so a visibility/compile break is caught on
   `main` instead of during a release.

## Expected effect (next tag, after one `main` warm run)

Cold ≈ 5.5-6 min → warm ≈ 2.5-3.5 min, with the AAB skip saving another
~60-90s on non-Play releases. Keys in the two workflows must stay
byte-identical — change one, change both.

## Deliberately not done

- **Gradle configuration cache** (`--configuration-cache`): Capacitor's
  Cordova plugin Gradle scripts are not configuration-cache safe; enabling
  it risks release-build failures for ~40-60s. Revisit at Capacitor 7.
- **`org.gradle.daemon=true` on CI**: runners are cold; the daemon costs
  more than it saves.
- **`minifyEnabled` changes for debug**: R8 strips Capacitor plugin classes.
