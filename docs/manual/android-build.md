# Android build (Capacitor + Bun)

## Local

```bash
bun install
bun run build
npx cap sync android
chmod +x android/gradlew
cd android && ./gradlew assembleDebug --no-daemon --parallel --build-cache
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk`
Install: `adb install -r <path>`

## Pins (drift mat karein)

Node 24 · JDK 21 Temurin · Android SDK 35 · Gradle 8.11.1 · Capacitor 6.x
App id `com.naveenbharat.app` — `versionName` **numeric** hona chahiye
(`main` / `v1.0` bhejne par Gradle fail karega).

## Common failures

| Error | Fix |
| --- | --- |
| `Could not resolve @capacitor/*` | `npx cap sync android` dobara |
| `versionName ... not valid` | numeric `APP_VERSION_NAME` bhejein |
| `R8: Missing class` | `android/app/proguard-rules.pro` me add karein |
| `GC overhead` | `GRADLE_OPTS=-Xmx6g` |
| Plugin APK me nahi mila | `android/app/src/main/assets/capacitor.plugins.json` check |

## Non-failures (ignore karein)

`flatDir should be avoided`, `buildconfig deprecated`, `DEP0040 punycode`,
Gradle 9 deprecation warnings — sab upstream Capacitor/plugin se aate hain.

## Debug WebView

`CAP_DEBUG=1` set karke build karein to remote WebView debugging on hoti hai
(Maestro `androidWebViewHierarchy: devtools` ko yahi chahiye). Release build me
ye **off** rehti hai.
