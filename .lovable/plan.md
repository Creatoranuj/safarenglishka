## Fix: Sentry ProGuard mapping upload fails on `build-apk.yml`

### Root cause

The **Sentry release + ProGuard mapping** step in `.github/workflows/build-apk.yml` (line ~747) calls:

```bash
sentry-cli --log-level=info upload-proguard \
  --android-manifest android/app/src/main/AndroidManifest.xml \
  --version-code "${GITHUB_RUN_NUMBER:-1}" \
  --version-name "${APP_VERSION_NAME}" \
  "$MAPPING"
```

`sentry-cli 3.6.0` (the version the workflow installs via `curl -sL https://sentry.io/get-cli/ | bash`) removed the `--android-manifest`, `--version-code`, and `--version-name` flags from `upload-proguard`. The CLI now derives the mapping UUID from `mapping.txt` itself and treats app/version association purely through the release object. Result:

```
error: unexpected argument '--android-manifest' found
Error: Process completed with exit code 2.
```

### Fix

Update the `upload-proguard` invocation to the v3-compatible form. The release object (`sentry-cli releases new/set-commits/finalize`) already carries `com.safarenglishka.app@<version>+<code>`, which is what Sentry uses to link the mapping to a release; the removed flags are redundant.

**Change in `.github/workflows/build-apk.yml`:**

```bash
sentry-cli --log-level=info upload-proguard "$MAPPING" 2>&1 | tee /tmp/sentry-upload.log
```

Optional hardening while we're in there:
- Pin `sentry-cli` so this can't silently break again: `curl -sL https://sentry.io/get-cli/ | INSTALL_DIR=/usr/local/bin bash -s -- 2.42.2` (last version that accepted the old flags) **OR** keep latest and use the new form above. Recommendation: keep latest + new form (future-proof).
- No other flag on the release/set-commits/finalize/debug-files list commands is affected.

### Out of scope (separate workflow failures visible in the uploaded screenshots)

You also uploaded logs for two other failing workflows. They are **not** the sentry-cli issue and I'll leave them for a follow-up unless you say otherwise:

1. `android-e2e` (`maestro-android.yml`) — `compileDebugJavaWithJavac` fails with `invalid source release: 21`. The job is using JDK < 21 while `capacitor.build.gradle` pins `VERSION_21`. Fix = bump `setup-java` to `java-version: '21'` in that workflow (build-apk.yml already does).
2. `signed-apk-smoke.yml` — annotation shows `Process completed with exit code 1` inside `smoke-signed-apk`; log truncated in the upload. Need to open the failing step in the full log to diagnose.

### Technical details

- File touched: `.github/workflows/build-apk.yml`, lines ~747-751.
- One-line replacement; no code, gradle, or Sentry project settings change.
- Verification: next tag push runs the workflow — the step should print `Uploading ProGuard mapping.txt` → success, then finalize the release.

### Skills applied

`senior-architect-audit` (CI/CD reliability lens) and `console-error-triage` (root-cause the exact CLI error, fix at the root, don't suppress).

Want me to also fix the `android-e2e` Java 21 issue and dig into the `signed-apk-smoke` failure in the same pass?