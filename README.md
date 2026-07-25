# Safar English Kaa
Education Platform

## Environment Flags

| Flag | Stage | Purpose |
| --- | --- | --- |
| `CAP_DEBUG` | build-time (consumed in `capacitor.config.ts`) | When `true`, enables `webContentsDebuggingEnabled` on Android + iOS so `chrome://inspect` and Safari Web Inspector can attach to the WebView. **Must be unset for Play Store / App Store releases** (see `docs/SECURITY_CHECKLIST.md`). Set per-build, not committed: `CAP_DEBUG=true npm run build && npx cap sync`. The flag is read only at config-load time, so a CI release job that does not export it will produce a debug-disabled binary regardless of local shell state. |
| `VITE_SENTRY_DSN` | runtime, prod only | Activates the Sentry SDK + the console.error forwarder in `src/lib/sentry.ts`. Without it, telemetry is a no-op. |
| `VITE_ENABLE_ERUDA` | runtime, QA builds | Loads Eruda DevTools panel for non-admin QA. Admin path is gated separately via `nb_admin_eruda` localStorage flag. |

## Observability

Every `console.error(...)` call in the app is forwarded to Sentry in production
(once `VITE_SENTRY_DSN` is set) via the patched `console.error` in
`src/lib/sentry.ts`. This means the legacy silent-catch sites across
`src/hooks/**` and `src/lib/**` automatically gain observability — no
per-file sweep required. New code should still prefer the explicit
`reportError(err, { surface })` helper exported from the same module.

## Security scanner expectations

Every run of `security--run_security_scan` reports **9 warnings** on linter
check `0029` (`security_definer_function_executable_by_authenticated`) and
**1 INFO** on `0008` for `public.phone_otps` (RLS enabled, no policies).
Both are **expected and intentional**:

- The 9 SECURITY DEFINER functions (`has_role`, `get_user_role`,
  `get_quiz_questions`, `verify_enrollment_for_attendance`,
  `get_course_bundle`, `get_dashboard_snapshot`, `get_user_profiles_admin`,
  `get_platform_stats`, `get_course_lesson_stats`) each scope internally to
  `auth.uid()` and are safe to expose to `authenticated`.
- `phone_otps` is server-only: written/read exclusively by the
  `send-phone-otp` / `verify-phone-otp` edge functions via `service_role`.
  `anon` and `authenticated` have zero grants — see the table `COMMENT`.

Any **new** warn on 0029 for a *different* function, or any policy added to
`phone_otps`, is a real finding and must be reviewed. Ignore-justifications
live in the security-memory.

