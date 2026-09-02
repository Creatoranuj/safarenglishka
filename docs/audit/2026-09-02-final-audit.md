# Final Audit — Safar English (v1.3.0)

Date: 2026-09-02 · Scope: payments (Razorpay + UPI), crash resilience, touch
feel, Capacitor/APK build, Maestro E2E pipeline.
Lenses: senior staff engineer + senior product/visual designer.

**Rating: 4/5** — the app is production-grade on payments, crash handling and
native feel; the one HIGH was a CI-only defect (Maestro could not read the
WebView) that is fixed in this release.

---

## Findings

### [HIGH] [CONFIG] Maestro devtools hierarchy was blind — every E2E run failed on a healthy emulator
**Where:** `.github/workflows/maestro-android.yml` (build + `cap sync` steps),
`capacitor.config.ts:webContentsDebuggingEnabled`
**Evidence:** run #71 job log — emulator booted, app installed, login step
reached, then `[Failed] smoke (4m 2s) (Assertion is false: "...Sign In..." is
visible)` twice, with black screenshots and an empty view hierarchy. Host
memory never dropped below 10.2 GB of 16 GB and `dmesg` showed no `oom-kill`,
so this was never an infrastructure kill.
**Why it matters:** `maestro/smoke.yaml` declares `androidWebViewHierarchy:
devtools`, which reads the DOM over the WebView remote-debugging protocol.
`capacitor.config.ts` only enables `webContentsDebuggingEnabled` when
`CAP_DEBUG=1`, and CI never set it — so Maestro saw an empty document and every
assertion failed regardless of product state. Five runs of emulator flag
tuning chased the wrong layer.
**Fix (applied):** `CAP_DEBUG: '1'` on both the web build and the `cap sync`
step of the E2E workflow only. Release builds are untouched and still ship with
remote debugging OFF (CAP001).

### [MEDIUM] [UX] Bank UPI apps were invisible on Android 11+
**Where:** `android/app/src/main/AndroidManifest.xml` `<queries>`
**Why it matters:** package visibility filtering means an app absent from
`<queries>` cannot appear in the Razorpay UPI-intent list. GPay/PhonePe/Paytm/
BHIM/CRED/Amazon Pay were listed; bank-issued UPI apps (iMobile, PayZapp, SBI,
Axis, Kotak, BoB) were not — users who pay only through their bank app saw a
shorter list than they expected.
**Fix (applied):** added the six major bank UPI packages to the single
`<queries>` block. No new permissions; visibility only.

### [MEDIUM] [OBS] Payment failures are legible, refunds less so
**Where:** `src/utils/razorpayNative.ts`, `src/utils/razorpay.ts`
**Why it matters:** the native path logs `has_upi` and the exact
`methods_enabled` map, which makes "UPI tab is empty" a 30-second diagnosis.
The refund path has no equivalent breadcrumb, so a stuck refund needs dashboard
archaeology.
**Fix:** documented in `docs/payments/test-mode.md`; add a structured log line
in `initiate-refund` next iteration. Backlog.

### [LOW] [MAINT] `package.json` version was stuck at `0.1.0`
**Where:** `package.json`
**Why it matters:** the Android `versionName` comes from `APP_VERSION_NAME`
(numeric-stripped in `android/app/build.gradle`), so the npm version was purely
cosmetic — but it made release notes and tags disagree with the manifest.
**Fix (applied):** bumped to `1.3.0` to match the tag.

### [N/A] [SEC] / [AUTHZ]
No secret material is present in the client bundle: `key_id` is returned per
order by `create-razorpay-order`, signature verification is server-side HMAC in
`verify-razorpay-payment`, and `razorpay-webhook` is the idempotent enrollment
source of truth. Roles remain in `public.user_roles` behind `has_role()`.
Verified by reading the call sites, not assumed.

---

## Wins

- **Payments are webhook-first.** `BuyCourse.tsx` never treats the client
  `handler` callback as proof of payment; enrollment lands from
  `verify-razorpay-payment` or, if the app dies mid-flow, from
  `razorpay-webhook`. This is the single most-often-wrong thing in Indian
  payment integrations and it is right here.
- **Correct platform split.** `Capacitor.isNativePlatform()` selects
  `openNativeRazorpayCheckout` (native sheet, amount as a paise **string**) vs
  `openRazorpayCheckout` (web JS SDK, amount as an integer). Loading the web SDK
  on native is what silently breaks UPI intents; this codebase avoids it.
- **UPI-first ordering.** `UPI_FIRST_CHECKOUT_CONFIG` puts a `block.upi` block
  with `flows: ['intent', 'collect', 'qr']` at the top of the sequence — the
  correct default for an Indian EdTech audience.
- **Crash shield is real, not decorative.** `src/lib/crashShield.ts` (heartbeat
  watchdog + global rejection handler), `ErrorBoundary.tsx` with a bounded retry
  guard, and `queryPersister.ts` with a capped cache cover the three ways a
  low-RAM Android WebView actually dies. `crashShield-memory-monitor.test.ts`
  keeps it honest.
- **Security posture in the Capacitor config is deliberate.** Remote debugging
  is opt-in per build, `allowNavigation` was narrowed from wildcards to explicit
  hosts, Supabase hosts were removed from the WebView trust surface, and
  `PrivacyScreen` is JS-controlled so FLAG_SECURE cannot trap admins. Each of
  these carries a comment explaining the incident that motivated it — rare and
  worth preserving.
- **Splash and first paint.** `launchAutoHide: false` with a JS-side 2s safety
  timeout, plus the `Dashboard.tsx` `lazy()` + skeleton split, means the first
  frame is header + active-course card rather than three query-bound widgets
  mounting in one frame.

## Design lens [VIS] / [MOT]

Verified against the Linear/Lovable bar: the app uses semantic tokens rather
than `text-white`/`bg-black`, skeletons match final layout instead of centred
spinners, and haptics are wired through `nativeChrome.ts` (`tapMedium`,
`notifySuccess`, `notifyError`) on the payment CTA and its outcomes — primary,
success and destructive feedback all distinct. Status bar and splash colours
(`#F7F4EE`) match the app shell so there is no white flash on cold start.
No HIGH visual finding on the payment surface.

Nit [LOW] [MOT]: success/failure on `PaymentCallback` leans on the toast plus a
sound cue; a 200ms scale-in on the success card would make the moment feel
earned. Backlog.

---

## Fix Plan

1. **Applied now (v1.3.0):** CAP_DEBUG in the E2E workflow, bank UPI package
   visibility, version bump, payments test-mode documentation.
2. **This week:** structured logging in `initiate-refund`; re-verify the Maestro
   smoke gate stays green across two consecutive dispatches before trusting it
   as a release gate.
3. **Backlog:** `PaymentCallback` success micro-animation; revisit the six open
   dependency-audit findings when upstream ships fixed majors.

## Open questions

- Firebase Test Lab (real device) remains the only way past emulator-renderer
  flakiness if the emulator regresses again — not adopted, no paid device farm
  in scope.
- Razorpay test keys are set by the maintainer in Supabase/GitHub secrets; this
  audit did not handle any secret values.
