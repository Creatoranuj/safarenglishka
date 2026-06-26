# Safar English Ka
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
