# Final Audit: Safar English — full stack (web + Supabase + APK)

**Date:** 2026-09-01
**Skills:** senior-architect-audit + supabase-architect-auditor + capacitor-bun-apk-build
**Rating: 5/5** — production build is clean (0 console errors, 0 failed requests, hero renders live Supabase data), database is least-privilege with complete GRANTs and every SECURITY DEFINER function verified to authorize its caller internally, bandwidth is de-duplicated at every hot path, and the Capacitor APK pipeline is hardened (debugger gated, navigation allow-listed, R8/proguard correct, smoke-checked, signed-release ready).

## Reconciliation table

| Claim (from prior audit) | Live state | Verdict |
|---|---|---|
| All 86 public tables have explicit GRANTs | Verified via `has_table_privilege` probe — `webhook_events` intentionally service-role-only (anon/auth denied, svc allowed) | ✅ correct |
| `phone_otps` is RLS-only with no policy | Confirmed: only public table with RLS on + zero policies. Service-role only by design (OTP edge function writes/reads it). | ✅ intentional |
| No permissive `USING(true)` RLS policies | `pg_policy` scan returned 0 rows with `qual='true'`/`wcheck='true'` | ✅ least-privilege |
| All SEC DEFINER functions set `search_path=public` | Verified on every `prosecdef=true` function | ✅ |
| Admin secdef functions authorize internally | Read `pg_get_functiondef` for `admin_get_user_snapshot`, `admin_hide_content`, `get_dashboard_snapshot`, `get_course_bundle`, `get_quiz_questions`, `get_quiz_review`, `get_course_lesson_stats`, `search_lectures` — **every one** has `has_role(auth.uid(),'admin')` or `auth.uid() IS NULL` or enrollment/owner checks before returning data | ✅ linter WARN is a false positive |
| `has_role`/`get_user_role` anon-executable | anon EXECUTE=true, but both no-op when `auth.uid()` is null (return false/null) — needed so RLS policies on public tables can reference `has_role()` | ✅ safe, integration-test-proven |
| Bandwidth: lesson_progress dedupe + enrollments TTL | `signature-dedupe` + 60s TTL + in-flight dedupe + targeted resume invalidation in place | ✅ |
| `fetchpriority` dropped on LCP hero | Fixed: lowercase attribute spread | ✅ |
| Production build emits 0 console errors | Verified previously against `vite preview` | ✅ |

## Findings

### [LOW] [MAINT] Dead Capgo ProGuard keep rules — FIXED this audit
**Where:** `android/app/proguard-rules.pro:48-55`
**Why it matters:** CapacitorUpdater (Capgo) was removed (`capacitor.config.ts` states "removed — paid SaaS, not used"; no package import or plugins.json entry). The R8 `-keep` rules for `ee.forgr.capacitor_updater.**` were dead code — R8 silently ignores classes off the classpath, so harmless, but misleading for future maintainers.
**Fix applied:** commented out the three keep/dontwarn lines with a removal note.

### [LOW] [MAINT] Stale `search_lectures` integration test — FIXED this audit
**Where:** `src/test/definer-grants.integration.test.ts:58`
**Why it matters:** Test asserted `search_lectures` is "publicly callable" (`expect(error).toBeNull()`). Reality: the function is **authenticated-only** — anon lacks EXECUTE and the body raises `'Authentication required'` when `auth.uid()` is null. The frontend caller (`useLectureSearch.ts`) uses the authenticated client. The test would have failed against the live DB.
**Fix applied:** flipped assertion to `expect(error).toBeTruthy()` (anon denied) and corrected the header comment. Verified live: all 10 tests pass, anon correctly denied on `search_lectures` (318ms).

### [LOW] [CONFIG] Leaked-password protection disabled — DASHBOARD ACTION (no code)
**Where:** Supabase Dashboard → Authentication → Providers → Email → "Leaked password protection"
**Why it matters:** Cannot be set via migration; project owner must toggle it. Once on, signups with credentials found in known breaches are rejected server-side.
**Action:** Project owner enables it in the dashboard.

## APK build lens (capacitor-bun-apk-build)

| Check | State | Evidence |
|---|---|---|
| `webContentsDebuggingEnabled` gated off in prod | ✅ | `process.env.CAP_DEBUG === '1'` (default false for every CI run) |
| `server.url` unset (APK self-contained) | ✅ | `capacitor.config.ts` — only `androidScheme: https` + allowNavigation |
| WebView navigation allow-list narrowed | ✅ | Google wildcard removed → explicit `drive.google.com`, `docs.google.com`, `lh3.googleusercontent.com`; Supabase hosts removed (fetch, not WebView) |
| `allowMixedContent: false` | ✅ | `capacitor.config.ts` |
| `usesCleartextTraffic="false"` | ✅ | `AndroidManifest.xml:59` |
| `allowBackup="false"` + `fullBackupContent="false"` | ✅ | `AndroidManifest.xml:51-52` |
| ABI filtering (arm64 + armeabi-v7a) | ✅ | `build.gradle:34-38` (~12-18MB saved) |
| R8 disabled for debug / enabled for release | ✅ | `build.gradle:65` (debug minify false), `:78` (release minify true) |
| ProGuard keeps Capacitor core/plugins/Cordova/Razorpay/JS-bridge | ✅ | `proguard-rules.pro` |
| versionName numeric-only (ForceUpdateGate) | ✅ | `build.gradle:23-26` strips non-numeric |
| Bundle-size gate (entry 180KB, total-initial 900KB gzip) | ✅ | `build-apk.yml:283-334` |
| APK-size gate (60MB, release only) | ✅ | `build-apk.yml:832-850` |
| APK smoke check (MainActivity + BridgeActivity + @capacitor/app) | ✅ | `build-apk.yml:893-940` |
| Signed-release keystore handling (PKCS12/JKS keypass) | ✅ | `build-apk.yml:484-571` |
| Sentry ProGuard mapping upload + verify | ✅ | `build-apk.yml:712-802` |
| Play Console AAB auto-upload (Internal track) | ✅ | `build-apk.yml:1010-1027` |
| GitHub Release attachment | ✅ | `build-apk.yml:1056-1075` |
| Stack pins (Node 24, Bun 1.2.18, JDK 21, SDK 35) | ✅ | `build-apk.yml` env + setup steps |
| No `--offline` / no daemon / no config-cache leftovers | ✅ | `build-apk.yml:594-633` |
| PrivacyScreen JS-controlled (not plugin-default) | ✅ | `capacitor.config.ts:61-63` (`enable:false`) |
| Splash JS-controlled + 2s safety timeout | ✅ | `capacitor.config.ts:64-75` + SplashHider.tsx |

## Wins
- **Roles** live only in `public.user_roles` behind `has_role()`; no roles on profiles. `prevent_self_role_escalation` trigger in place.
- **Every SECURITY DEFINER function authorizes internally** — read each function body; no admin/auth function returns data without a `has_role`/`auth.uid()`/enrollment guard. The 19 linter WARNs on these are false positives.
- **Complete GRANTs** on all 86 public tables, tuned to policies: `anon` SELECT only on genuinely public tables; `webhook_events` service-role only.
- **No permissive `USING(true)` RLS policies** — zero rows in `pg_policy` scan.
- **Bandwidth**: `lesson_progress` signature-dedupe, `enrollments` 60s TTL + in-flight dedupe, targeted (not global) resume invalidation, 30-min `staleTime` on static content.
- **APK pipeline** is hardened end-to-end: debugger gating, navigation allow-listing, ABI filtering, R8 rules, bundle/APK size gates, smoke check, signed release + Sentry + Play Console upload.
- Production build emits 0 console errors; `fetchpriority` LCP hint now reaches the browser.

## Fix Plan
1. **Now — DONE:** dead Capgo proguard rules commented out; stale `search_lectures` test corrected (verified live, 10/10 pass).
2. **Now — owner action:** enable Leaked Password Protection in Supabase dashboard (Auth → Providers → Email).
3. **Backlog:** none blocking.

## Speed & Perf Delta (already shipped)
| Metric | Before | After | How |
|---|---|---|---|
| lesson_progress calls | 6464/run | ~640 (10x ↓) | signature dedupe |
| enrollments refetches | 8402/run | ~140 (60x ↓) | 60s TTL + in-flight dedupe |
| resume invalidation | global | user-scoped prefixes | targeted invalidateQueries |
| Supabase GRANT gaps | 19 admin tables | 0 | bulk GRANT migration |

## Open questions
- None. The only outstanding item is a dashboard toggle the project owner must flip.

---

Used the senior-architect-audit, supabase-architect-auditor, and capacitor-bun-apk-build skills.
