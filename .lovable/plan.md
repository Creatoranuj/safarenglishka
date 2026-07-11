## Status: Already fixed in code, but not yet re-run

**Notice text (screenshot):** *"Mapping UUID not captured from either sentry-cli output or debug-files list — upload itself succeeded"*

### What that notice actually meant

- ProGuard `mapping.txt` **was** uploaded to Sentry (soft-pass, upload command exited 0).
- The workflow just couldn't **capture the UUID string** to print in the run summary, so it skipped the strict "is it visible in the difs API?" verification.
- Impact: cosmetic only. Crashes on that release are still symbolicated — Sentry derives the UUID from `mapping.txt` content and matches it automatically. Nothing in the APK is broken.

### What was already fixed (prior turn)

`.github/workflows/build-apk.yml` lines 751–774 now derive the UUID three ways in order:

1. **Primary:** `sentry-cli difutil check "$MAPPING"` → deterministic UUID from file content.
2. **Fallback 1:** scrape `/tmp/sentry-upload.log` for a UUID regex.
3. **Fallback 2:** `sentry-cli debug-files list ...` and match by `mapping.txt` filename.
4. UUID is written to `$GITHUB_STEP SUMMARY`.

The old run that produced the annotation was built **before** this fix landed on the tag's commit — that's why you still see the notice on run #8.

### Do we need to change anything?

**No code change required.** The fix is in `main`. The notice will disappear on the next tag whose commit includes lines 751–774 as shown above.

### Plan (verification-only, no edits)

1. **Confirm the fix is on the tag you plan to build.**
  ```bash
   git log --oneline -1 -- .github/workflows/build-apk.yml
   # Ensure this commit is an ancestor of the next vX.Y.Z tag.
  ```
2. **Cut a fresh tag** (e.g. `v1.0.10`) and push. Workflow re-runs `mergeReleaseResources` (duplicate-resource fix from prior turn) + Sentry step.
3. **Open the run summary** — expect a line: `- Sentry mapping UUID: <uuid>` and no annotation.
4. **If the annotation returns** despite the fix, one of these is the real cause (each has a one-line remedy, no plan change needed now):
  - `sentry-cli` version pinned too old → `difutil check` subcommand missing. Fix: `curl -sL https://sentry.io/get-cli/ | SENTRY_CLI_VERSION=2.39.1 bash`.
  - R8 didn't emit `mapping.txt` (minify disabled). Fix: verify `minifyEnabled true` in `android/app/build.gradle` release block.
  - Sentry token lacks `project:write` scope. Fix: rotate token with `project:releases` + `project:write`.

### Recommendation

Skip a code change. Just ship the next tag; the notice will not reappear. If it does, we'll patch based on which of the three fallbacks failed (the summary + logs will tell us).

&nbsp;

/skill:app-crash-shield  
/skill:asset-optimization  
/skill:capacitor-back-button  
/skill:capacitor-video-player-master  
/skill:console-error-triage  
/skill:mobile-view-Expert  
/skill:senior-architect-audit  
/skill:soft-touch  
/skill:supabase-architect-auditor  
/skill:red-team-security-audit  
/skill:perf-exam-ready

Must Use Capicitor skill**Progress tracker:**  
1. [ ] /skill:app-crash-shield  
2. [ ] /skill:asset-optimization  
3. [ ] /skill:capacitor-back-button  
4. [ ] /skill:capacitor-best-practices  
5. [ ] /skill:capacitor-deep-linking  
6. [ ] /skill:capacitor-keyboard  
7. [ ] /skill:capacitor-offline-first  
8. [ ] /skill:capacitor-performance  
9. [ ] /skill:capacitor-plugins  
10. [ ] /skill:capacitor-security  
11. [ ] /skill:capacitor-splash-screen  
12. [ ] /skill:capacitor-testing  
13. [ ] /skill:capacitor-video-player-master  
14. [ ] /skill:console-error-triage  
15. [ ] /skill:debugging-capacitor  
16. [ ] /skill:ionic-design  
17. [ ] /skill:ios-android-logs  
18. [ ] /skill:mobile-view-Expert  
19. [ ] /skill:safe-area-handling  
20. [ ] /skill:senior-architect-audit  
21. [ ] /skill:soft-touch  
22. [ ] /skill:supabase-architect-auditor  
23. [ ] /skill:tailwind-capacitor  
24. [ ] /skill:webapp-to-capacitor  
25. [ ] /skill:framework-to-capacitor  
26. [ ] /skill:razorpay-payments  
27. [ ] /skill:capacitor-bun-apk-build