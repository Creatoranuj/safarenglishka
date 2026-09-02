# CI & E2E

## Workflows

| Workflow | Kaam |
| --- | --- |
| `build-apk.yml` | Debug APK (tag `v*` / manual) |
| `maestro-android.yml` | Emulator E2E (currently parked) |
| `android-compile-guard.yml` | Native compile regression guard |
| `playwright.yml` | Web E2E (Chromium only) |

## Maestro — kya seekha (measured, guess nahi)

| Run | Change | Result |
| --- | --- | --- |
| #56–57 | baseline | driver died on `viewHierarchy` @92s |
| #59 | host instrumentation | host healthy — 10.2 GB free, zero oom-kill |
| #60 | `-gpu guest` | 272s survival, same failure 3× later |
| #71 | Maestro 2.6.1 | landing assert fail, black screenshots |
| #72 | `CAP_DEBUG=1` | longer survival, still black |
| #73 | cold-launch logcat | **root cause milा**: `Fatal signal 5 (SIGTRAP)` in `libwebviewchromium.so` 101.0.4951.61 |

Root cause product bug nahi tha — `google_atd` API 33 ki bundled WebView humare
command-line override (`--in-process-gpu`, disabled rasterization) ke saath crash
kar rahi thi. Override hata diya gaya (`main`, commit `cd4e5fb`).

Emulator ko aur flags se peetna faayde ka sauda nahi. Agla sahi kadam real device
(Firebase Test Lab / paid farm) hai — abhi scope se bahar.

## Golden rules

1. Emulator `script:` ki pehli line `set -e` — **kabhi** `set -o pipefail` nahi
   (runner `sh` = dash, line 1 par hi mar jata hai).
2. Artifact actions node24 majors par rakhein.
3. Login creds sirf GitHub Secrets se; artifacts me screenshots jaate hain isliye
   **admin account kabhi nahi** — dedicated student account hi.
4. Emulator boot ka shor (`device offline`, `.ini` warnings) chase mat karein;
   asli failure "Terminate Emulator" se pehle aakhri `##[error]` hai.
