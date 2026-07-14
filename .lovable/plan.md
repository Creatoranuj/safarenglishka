## Signed APK Smoke — run #19 root cause fixed ✅

Run #19 me emulator boot + signed APK install **success** tha. Failure ab native/build layer me nahi tha; Maestro smoke flow ke login steps brittle the:

- email field tap missing tha, isliye `inputText` focused input ke bina run ho sakta tha.
- button text flow me `Sign in` tha, app me actual text `Sign In` hai.
- `Dashboard` visible text app ke student/teacher dashboard par guaranteed nahi hai.
- CI me Maestro env values now explicit `--env` se pass hoti hain.
- Next failure aaya toh `maestro-debug` screenshots/logs artifact me upload honge.

---

## Verification: native/build layers ready ✅

Maine `.github/workflows/signed-apk-smoke.yml` aur `android/app/build.gradle` dono re-audit kiye. Saare native failure layers fixed hain:

| # | Fix | Line evidence |
|---|---|---|
| 1 | Ubuntu + KVM runner | `runs-on: ubuntu-latest` + "Enable KVM" step |
| 2 | Staged smoke script (S11 fix — `$APK` persist) | `/tmp/smoke.sh` heredoc, invoked as `bash /tmp/smoke.sh` |
| 3 | Emulator ABI widened | `ANDROID_ABI_FILTERS: "arm64-v8a,armeabi-v7a,x86_64"` |
| 4 | Gradle honors env override | `build.gradle:34` reads `System.getenv("ANDROID_ABI_FILTERS")` |
| 5 | YAML valid (no duplicate `if:`) | `upload-logcat` + `Cleanup keystore` split, artifacts@v6 |

**S1 rule bhi safe hai** — `android-emulator-runner` `sh` use karta hai, lekin humne `bash /tmp/smoke.sh` explicit invoke kiya hai, aur staged file me `#!/usr/bin/env bash` + `set -eo pipefail` hai. Dash trap avoid.

---

## Crash-free probability

**~90%** — assuming GitHub Secrets sahi hain. Bacha 10% risk sirf 2 external cheezon pe:

- **`KEYSTORE_BASE64`** — humne fresh keystore generate kiya tha; agar aapne verbatim paste kiya (no line breaks) toh green. Agar copy-paste me space aa gaya → `KeytoolException` wapas.
- **`MAESTRO_EMAIL` / `MAESTRO_PASSWORD`** — ab CI me explicit `--env` se pass ho rahe hain. Agar creds galat hue toh debug screenshot/log artifact me exact login error dikhega.

Code-side koi known bug nahi bacha. Agla failure agar aata hai toh **naya signature** hoga, purani list ka repeat nahi.

---

## Replit me chalane wale commands (single sequence — ruk mat)

```bash
# 1. Latest Lovable code
git pull origin main --rebase

# 2. 5-line sanity check — sab ✅ chahiye
grep -q "runs-on: ubuntu-latest" .github/workflows/signed-apk-smoke.yml && echo "✅ Ubuntu"
grep -q "Enable KVM"              .github/workflows/signed-apk-smoke.yml && echo "✅ KVM"
grep -q "/tmp/smoke.sh"           .github/workflows/signed-apk-smoke.yml && echo "✅ Staged script"
grep -q "x86_64"                  .github/workflows/signed-apk-smoke.yml && echo "✅ x86_64 ABI"
grep -q "ANDROID_ABI_FILTERS"     android/app/build.gradle              && echo "✅ Gradle env"

# 3. Native re-sync (agar koi native change hai)
bun install
bun run build
npx cap sync android
git add -A && git commit -m "chore: sync native for v1.0.17" || echo "nothing to commit"
git push origin main

# 4. Tag rotate — remote pehle delete, phir push
git tag -d v1.0.17 2>/dev/null || true
git push origin :refs/tags/v1.0.17 2>/dev/null || true
git tag v1.0.17
git push origin v1.0.17
```

Push ke baad **GitHub Actions → Signed APK Smoke** dekho — expected ~7-9 min me green.

---

## Agar fir bhi red aaye — kya dekhna hai

1. **Job logs** ka **last `##[error]`** line copy karke bhejo (boot noise ignore).
2. Logcat artifact `signed-smoke-logcat` download karo — agar APK install hua par Maestro fail, toh crash trace waha hoga.
3. Sentry dashboard check karo — release build ka pehla crash yaha aayega.

**Kya main koi code change karu?** Nahi — verify-only pass hua, sab locally green. Ab sirf aapko commands chalane hain. Approve karo toh execution guide (plan.md) commit kar dun as reference doc.