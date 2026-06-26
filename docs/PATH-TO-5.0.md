# Path to 5.0 — Architect Audit Tracker

Baseline rating: **4.55 / 5** (see chat audit dated 2026-06-14).

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Maestro device-matrix flows | ✅ scaffold | `maestro/smoke.yaml`, `maestro/pdf-back.yaml`. Wire into `.github/workflows/build-apk.yml` via `reactivecircus/android-emulator-runner` matrix (API 26/30/34). |
| 2 | Drop `'unsafe-inline'` from CSP | ⏳ blocked | Boot script needs external + SRI hash; Razorpay still injects inline. Track upstream. |
| 3 | Drop `'unsafe-eval'` from CSP | ⏳ blocked | Waiting on pdf.js build with `disableEval` (v5+). |
| 4 | Profile PDF reader, drop `largeHeap` | ⬜ todo | Use Android Studio Memory Profiler with 50MB PDF. |
| 5 | Migrate direct `@capacitor/*` imports in hooks → bridge | ⬜ todo | `useDeepLinks`, `useOnlineStatus`. Safe to defer — ESLint allow-list documented. |
| 6 | Per-route bundle-size CI gate | ✅ done | `scripts/check-bundle-size.mjs` enforces entry + chunk budgets. |
| 7 | Haptics on primary CTAs | ⬜ todo | Wrapper exists at `src/lib/native/haptics.ts` — needs wiring on Enroll / Mark Complete / Player back. |
| 8 | `touch-action: manipulation` on player gesture overlay | ✅ verified | `MahimaGhostPlayer.tsx:856,1277`. |
| 9 | Single `App.addListener('backButton')` | ✅ verified | Module-level `backButtonRegistered` guard in `useAndroidBackButton.ts`. |

## Scoring impact
- Hitting **#1 + #4 + #7** → **4.85**
- Hitting **all nine** → **5.0**

## Non-goals (intentionally not pursued)
- Certificate pinning — managed PKI rotates, would brick the APK. Documented in `docs/briefs/08-security.md`.
- Hard root/jailbreak block — premium content already gated by signed Bunny tokens.
