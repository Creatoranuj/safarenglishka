# Landscape reader chip, CI workflow shape, Razorpay/UPI — 2026-09-02

**Rating: 4/5** — the reader leak is now closed at the layer-tree level; CI is
structurally sound but its two main gates are soft-fail, so green does not mean
passing.

## 1. [CRITICAL] [SAFE] Reader header leaked a chip at the physical top in landscape

**Where:** `src/components/library/DocReaderShell.tsx`

The previous pass fixed two of three layers: the notch band is now portrait-only
and the hidden header translates by measured pixels instead of `-translate-y-full`.
What remained: in pseudo-landscape the header lives **inside the rotation frame**,
so `translateY` runs along the *rotated* y-axis — that points along the physical
screen edge, not away from it. The frame had `overflow` visible, so a slice of the
bar stayed painted in the physical top-left corner. Offline PDFs opened from
Saved / My Library (`FolderView` → `UniversalFileViewer` → `DocReaderShell`) render
on a different surface and show it most clearly, which is why it looked
library-specific.

**Fix applied**

- `headerRetired` state: 320ms after the hide transition ends the header is taken
  out of the layer tree with `display: none`, and re-mounted synchronously when the
  chrome returns. Nothing left to leak, on any axis.
- The rotation frame is now `overflow-hidden`, so no descendant can paint outside it.
- Regression tests extended in `src/test/docReaderShell-landscape-header.test.ts`
  (5 assertions: band portrait-only, pixel translate, fade + invisible, retire,
  frame clipped).

## 2. Supabase — verified, mismatch closed

`wegamscqtvqhxowlskfm` is the live database. Queried directly: `courses` = 2, which
matches the Admin screenshot. `.env`, `supabase/config.toml` and
`src/integrations/supabase/client.ts` already point at it. The earlier
`cmbattmjwriiesibayfk` label was stale — no repoint needed.

## 3. CI workflow shape — which is professional and fast

12 workflows. Current triggers are already close to correct:

| Tier | Workflows | Verdict |
| --- | --- | --- |
| Per push / PR (fast) | `code-guards`, `playwright-e2e` (chromium only), `dependency-audit`, `enrollment-bypass` | correct tier |
| Tag / main | `build-apk` | correct |
| Manual + nightly (slow) | `maestro-android`, `signed-apk-smoke`, `lighthouse-ci`, `razorpay-smoke`, keepalives, `flake-trend-aggregator` | correct |

Checklist results: artifact actions are all `upload-artifact@v6` / `download-artifact@v8`
(no node20 deprecation left); no `set -o pipefail` in any emulator `script:` (the
dash trap is avoided — `maestro-android` correctly uses `set -e`); Playwright runs
`--project=chromium` only, matching the chromium-only install.

**[HIGH] [OBS] Both main gates are soft-fail.**
`playwright-e2e.yml:104` ends in `|| echo "::warning::..."` and
`signed-apk-smoke.yml` marks every non-(API 33 + Maestro 1.39.0) leg
`continue-on-error`. A red suite therefore reports green. Both carry a comment
saying "convert to hard-fail after 5 consecutive greens" — that promotion is the
single highest-value CI change left. Not flipped in this pass because it would
change release gating without your call.

## 4. What the emulator log says

The uploaded log is from an **Ubuntu** runner (`/usr/local/lib/android/sdk/...`),
i.e. `signed-apk-smoke.yml` (`runs-on: ubuntu-latest`, `emulator-boot-timeout: 600`),
not the macOS `maestro-android.yml`. It shows a cold start, then ~50 cycles of
`adb shell getprop sys.boot_completed` → `adb: device offline` → exit 1, and the
log ends mid-line with **no `Boot completed`**. Reading: the emulator never
finished booting and the step burned its 600s boot timeout. The individual
`device offline` lines and the `.ini` warnings are benign boot noise, not the cause.

That job's header documents a deliberate choice — Ubuntu + `/dev/kvm` over macOS
HVF — with `force-avd-creation: true` and no snapshot, so each run is a cold boot.
Options, in order of cost: raise `emulator-boot-timeout` to 900 and cache the AVD;
or move this leg to `macos-14` like `maestro-android.yml`; or accept it as advisory
(it already is, via `continue-on-error`). No runner change made here — that file's
tiering was chosen on evidence and should be changed with a measured run, not a guess.

## 5. Razorpay / UPI in the Capacitor app — yes, and it is wired correctly

- `src/utils/razorpayNative.ts` uses the `capacitor-razorpay` plugin, which opens
  the **native Razorpay SDK sheet** — that is what lets UPI intents hand off to
  PhonePe / Google Pay / Paytm instead of dying in an in-app browser.
- `src/utils/razorpay.ts` (web path) already sets `method: { upi: true }` and puts
  a UPI block first in the display sequence with `flows: ['intent','collect','qr']`.
- Order creation (`create-razorpay-order`) and signature verification
  (`verify-razorpay-payment`) are server-side; `razorpay-webhook` is the idempotent
  enrollment fallback. Nothing client-trusted.

So UPI appears in the APK. Remaining check needs a physical device: confirm the
native path is chosen via `Capacitor.isNativePlatform()` (never both SDKs loaded),
amounts reach the native plugin as a **string of paise**, and the intent resolves
to an installed UPI app. No payment logic was touched.

## Follow-up (owner: you)

1. Promote `playwright-e2e` and the API 33 `signed-apk-smoke` leg to hard-fail.
2. Decide the emulator runner tier for `signed-apk-smoke` (timeout bump vs macOS).
3. Activate the skill set in Settings > Skills so the named audits run in their
   packaged checklist formats.
