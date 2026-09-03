# Skill: app-crash-shield

**Goal:** the app never shows a white screen. A failure degrades into something the student can still act on.

## Rules
1. Every route is wrapped in an `ErrorBoundary` with a Retry action; the boundary reports to Sentry with a `surface` tag.
2. Lazy chunks load through `lazyWithRetry` — a stale-chunk 404 after a deploy retries once, then hard-reloads.
3. Any `setInterval` / `addEventListener` must have a matching clear/remove in the same file. Guard: `crash-cleanup` (blocking).
4. No empty `catch {}`. Either handle it or `reportError(e, { surface })`. Best-effort native calls are the only fair exception. Guard: `empty-catch` (advisory).
5. Global handlers (`window.onerror`, `unhandledrejection`) live once, in `src/lib/crashShield.ts`.
6. Native crash paths: never assume a plugin exists — feature-detect `Capacitor.isNativePlatform()` first.

## Repo anchors
`src/lib/crashShield.ts`, `src/components/ErrorBoundary.tsx`, `src/lib/lazyWithRetry.ts`
