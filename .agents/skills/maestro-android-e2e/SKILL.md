---
name: maestro-android-e2e
description: Make Maestro Android E2E pass on GitHub Actions for a Capacitor WebView app. Use when a Maestro flow, emulator run, or android-emulator-runner job fails, hangs, times out, or when adding/editing maestro/*.yaml flows.
---

# Maestro Android E2E (Capacitor WebView)

Hard-won rules from ~60 red runs on a Capacitor + React app. Read the signature
table first — almost every new failure is a repeat of one below.

## Non-negotiables

1. **`androidWebViewHierarchy: devtools` on every flow.** A Capacitor app's
   Android accessibility tree exposes one empty `viewIdResName: root` node.
   Without devtools mode Maestro falls back to screenshots, and on API 33
   `google_atd` SurfaceFlinger returns `FB is protected: PERMISSION_DENIED` →
   null screenshot → `Service.screenshot` NPE → gRPC driver dies. Requires a
   debug build or `CAP_DEBUG=1` in the release build.
2. **Never `set -o pipefail`** inside `android-emulator-runner`'s `script:`. It
   runs under dash and aborts on line 1. Use `set -e`.
3. **Never `export` a variable for a later line** in that `script:` — each line
   is its own `sh -c`. Interpolate secrets directly into the command that uses
   them.
4. **Guard secrets before the emulator boots.** An empty `--env MAESTRO_EMAIL`
   silently submits a blank form and surfaces 2 minutes later as an unrelated
   assertion failure.
5. **Dump the hierarchy before asserting.** `maestro hierarchy > file` right
   after launch, uploaded unconditionally. Two full cycles were lost guessing
   at node structure.
6. **Split gates, don't write one mega-flow.** `login.yaml` then `nav.yaml`.
   The job log then names the failure class by itself.

## Signature → root cause → fix

| Signature | Root cause | Fix |
|---|---|---|
| `invalid source release: 21` | JDK mismatch with Capacitor 6 plugins | `actions/setup-java` `java-version: 21`, one `env.JAVA_VERSION` |
| `./gradlew: Permission denied` | `core.fileMode` on fresh checkout | `chmod +x ./gradlew` before the build |
| `HVF error: HV_UNSUPPORTED` / boot timeout on macOS | GitHub macos-14 is ARM, no hypervisor for the emulator | Move to `ubuntu-latest` + KVM udev rule |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | release ABI filters exclude x86_64 | Pass `ANDROID_ABI_FILTERS=x86_64,arm64-v8a` for the emulator build |
| Text typed into a label; `Please fill in all fields` | `<label for=x>` and `<input id=x>` both surface as id `x` | `tapOn: {id: x, index: 1}` and assert the empty-form error is *not* visible |
| `Element not found: you@example.com` | placeholder lives in `hintText`, not matchable | Match on the id, never on the placeholder |
| Every assertion false though the page painted | system ANR dialog covers the WebView | `adb shell settings put global hide_error_dialogs 1` + optional `tapOn: "Wait"` |
| `inputText` hangs 120s → `DEADLINE_EXCEEDED` | Gboard IME animating over the WebView | disable the IME via adb; `hideKeyboard` between fields |
| CPU starved, app ANRs, flow runs against launcher | `google_apis` image crash-loops Maps | use `target: google_atd` |
| emulator process vanishes, `port 5554: Connection refused` | host GL renderer fault under `swiftshader_indirect` | `-gpu guest`, `-memory 4096 -cores 2` |
| `DeviceServerDiedException` on `viewHierarchy` | heavy single-frame mount starves the gRPC channel | `waitForAnimationToEnd` (screenshot-based) before any hierarchy poll |
| Assertion passes but the tap did nothing | `optional: true` on a tap + assertion on a token visible everywhere (nav labels) | Non-optional tap, assert page-body-only copy |
| Gate turns red with no repo change | unpinned Maestro install | pin `MAESTRO_VERSION` |

## Flow authoring rules

- Every `assert*` / `extendedWaitUntil` carries an explicit `timeout`.
- Assert on **page-body copy**, never on a bottom-nav label — those are present
  on every screen and make a broken navigation look green.
- Regex-OR realistic tokens (`"Downloads|No downloads|Saved"`) so an empty state
  is as valid as a populated one; CI data is not deterministic.
- First-paint waits are generous (up to 240s) and `optional: true`; the next
  assertion is the hard one.
- Retry a gate exactly once on the same booted emulator: driver death is
  infrastructure, a real regression fails twice.
- Advisory flows (`pdf-back`, cold-start deep link) run with `|| true`.

## Debug loop when a run goes red

1. `grep -nE "##\[error\]|Element not found|DeviceServerDied|Timed out|INSTALL_FAILED|FAILURE: Build failed"` the job log — take the **last** error before "Terminate Emulator".
2. Emulator boot noise (`adb: device offline`, `.ini` warnings, `sys.boot_completed` retries) is benign. Never chase it.
3. Download the artifact and read `hierarchy-launch.txt` before changing any selector.
4. Match against the table above; only invent a new theory when nothing matches.
5. Validate YAML locally (`bunx js-yaml maestro/*.yaml`) before pushing — an emulator cycle costs ~15 min.

## Workflow skeleton

```
verify secrets -> checkout -> KVM udev -> node/bun/java -> install deps
-> validate flows (js-yaml) -> build web -> cap sync -> chmod+x gradlew
-> assembleDebug (x86_64) -> install Maestro (pinned)
-> android-emulator-runner (google_atd, x86_64, -gpu guest, 4GB/2cores):
     adb: hide_error_dialogs, disable IME, install APK
     hierarchy dump (always)
     login.yaml  (gate, one retry)
     nav.yaml    (gate, one retry)
     advisory flows || true
-> upload artifacts if: always()
```
