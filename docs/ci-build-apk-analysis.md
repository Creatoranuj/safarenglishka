# Deep analysis — "Safar English" APK build log archive (run #71, 2026-09-01)

Source: uploaded log archive `logs_90828095805.zip`, job **Build APK and Create Release** (2,764 log lines).
GitHub's UI reported 6 m 23 s for the run; the job itself is **373 s (6 m 14 s)** of wall clock — the rest is queue/provisioning.

## Step timeline (top costs)

| Time | Step | Note |
| --- | --- | --- |
| **169 s** | Gradle `assembleRelease` (`set -euo pipefail` block) | `BUILD SUCCESSFUL in 2m 43s`, `463 actionable tasks: 384 executed, 79 from cache` |
| **122 s** | `softprops/action-gh-release@v3` | uploading the 31 MB APK + AAB + mapping to the release |
| 23 s | tag/`workflow_run` guard block | shell + API checks |
| 14 s | `mkdir -p …/platforms/android-35` + SDK prep | ran because the SDK cache missed |
| 8 s | `bun install --frozen-lockfile` | `1006 packages installed [7.78s]` |
| 5 s | `bun run build` (Vite 8.0.16) | `✓ built in 4.07s` |
| ~7 s | artifact uploads (3×) + `dist` zip | |
| 4 s | Java 21.0.12 resolve (tool-cache hit) | |

Everything else is sub-2 s. So **78% of the job is two steps: Gradle (45%) and the GitHub release upload (33%).**

## The real problem: every cache missed

Six restore steps, six misses in one run:

```
Cache not found: Linux-node-modules-bun-00d15c7a…
Cache not found: Linux-bun-00d15c7a…            (no restore-key hit either)
Cache not found: Linux-vite-2908f20d…
Cache not found: Linux-gradle-wrapper-12584d79…
Cache not found: Linux-gradle-buildcache-1eff1249…
Cache not found: Linux-android-sdk-35-build-tools-35.0.0-v1
gradle cache is not found
Downloading a new version of Bun … bun-v1.2.18
Downloading https://services.gradle.org/distributions/gradle-8.11.1-bin.zip
```

Consequences, measured in this log:

- Gradle downloaded its own 8.11.1 distribution and ran with `--no-daemon --no-configuration-cache`, so **384 of 463 tasks executed from scratch** (only 79 from cache). A warm `build-cache-1` typically flips that ratio and takes this step from ~170 s to well under a minute.
- The step even prints `✅ Android SDK 35 restored from cache — skipping sdkmanager` **immediately after the cache reported a miss** — the message is unconditional and misleading; the SDK was actually re-provisioned.
- The workflow deliberately strips `org.gradle.configuration-cache=true` and `org.gradle.offline=true` from `gradle.properties` and passes `--no-configuration-cache`. That is a safety choice, but it forfeits the single biggest Gradle win on repeat builds.

Why the misses: the cache keys hash lockfiles/wrapper properties **and** there are no useful `restore-keys` for the node-modules and vite keys, so any dependency or config change invalidates 100% of the caches at once — which is exactly what happened on the asset-fix commit.

## Bundle-size gate

The gzip budget gate ran and passed: `TOTAL_INITIAL_MAX_KB=900` for entry + `vendor-*.js`, with per-file ceilings. Vite build itself is a non-issue at 4 s.

## Output

`✅ APK built successfully: …/apk/release/app-release.apk (31M)`, ProGuard `mapping.txt` uploaded (0.672 s), release assets named `SafarEnglish-v1.0-20260901-1422.apk` + a fixed `SafarEnglish.apk` alias.

## Concrete fixes, in payoff order

1. **Add `restore-keys` to every cache** (`Linux-node-modules-bun-`, `Linux-vite-`, `Linux-gradle-wrapper-`, `Linux-android-sdk-`). A near-miss then still restores ~90% of the content. Expected saving: **60–110 s per run**.
2. **Persist the Gradle build cache on `main`** (save on push to `main`, restore everywhere) so PR builds always start warm. `384 executed → ~80 executed` is the target.
3. **Re-enable the Gradle configuration cache** on a trial branch; if the reason it was disabled no longer applies, that is another ~20–30 s.
4. **Cache the Bun binary / pin via `oven-sh/setup-bun` cache** — it re-downloaded Bun 1.2.18 in this run.
5. **Shrink the release upload (122 s)**: upload the APK/AAB once (currently APK + AAB + mapping + separate `upload-artifact` steps duplicate bytes), or gate AAB upload to tagged releases only.
6. **Fix the misleading "restored from cache" echo** so the log stops claiming a cache hit on a miss — it hides exactly this class of regression.

Realistic target after 1–3: **~3 m 30 s** for a warm build, from 6 m 14 s.
