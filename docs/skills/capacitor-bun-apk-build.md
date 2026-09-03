# Skill: capacitor-bun-apk-build

**Goal:** a reproducible debug/release APK from CI with bun.

## Pipeline
1. `bun install --frozen-lockfile`
2. `bunx tsc --noEmit` → `bunx vitest run` → `bun run build`
3. `bunx cap sync android`
4. `cd android && ./gradlew assembleDebug` (or `assembleRelease` with the signing secrets)
5. Upload `android/app/build/outputs/apk/**/*.apk` as an artifact.

## Rules
- `@capacitor/*` runtime deps and the Android plugin list must stay in parity — `scripts/verify-capacitor-deps.mjs` runs in CI.
- JDK 21, Android SDK 35, Gradle cache keyed on `gradle/**` + lockfile.
- Never commit keystores; signing comes from repo secrets.
- The web build must succeed before `cap sync` — a stale `dist/` silently ships old code.

## Repo anchors
`.github/workflows/build-apk.yml`, `scripts/verify-capacitor-deps.mjs`
