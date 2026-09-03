# Skill: console-error-triage

**Goal:** the console is a signal, not wallpaper.

## Rules
1. `console.error` only inside the logging layer (`src/lib/log.ts`, `nativeDebug.ts`, `reportError.ts`, `sentry.ts`). Everywhere else use `reportError`. Guard: `console-error` (blocking).
2. Production forwards `console.error` to Sentry — every stray call is paid noise.
3. Triage order for a real console error: reproduce → find the owning surface → fix cause, never silence → add a test if it was logic.
4. Known-noisy third-party warnings are filtered by pattern in `nativeDebug.ts`, with a comment saying why.
5. Zero uncaught errors on the landing, login, dashboard and lesson routes is the release bar.

## Repo anchors
`scripts/check-console-usage.mjs`, `src/lib/nativeDebug.ts`
