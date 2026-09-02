# Quality ELO — Safar English (Capacitor)

Run it yourself: `node scripts/quality-elo.mjs`

Twelve tracks, each scored 0-100, weighted into one composite out of 2400 so a
regression shows up as a number instead of a feeling.

## Scoreboard (2026-09-02)

| Track | Before | After | Weight |
| --- | --- | --- | --- |
| Architecture | 60 | 60 | 1.2 |
| Crash shield | 67 | 100 | 1.2 |
| Back button | 80 | 100 | 1.0 |
| Asset optimization | 100 | 100 | 1.0 |
| Video player | 100 | 100 | 1.1 |
| Console triage | 100 | 100 | 0.9 |
| Mobile view | 100 | 100 | 1.1 |
| Soft touch | 100 | 100 | 0.8 |
| Supabase audit | 100 | 100 | 1.2 |
| Red team | 100 | 100 | 1.3 |
| Perf exam-ready | 100 | 100 | 1.1 |
| Sentry triage | 100 | 100 | 0.8 |

**Composite: 2161 → 2340 / 2400 (Master).** Weighted average 92 → 96.

## Bird's-eye

The app is in good shape on the dimensions that decide whether a low-end Android
install survives a two-hour study session: the players release their media
surfaces on unmount, the Android back chain is a documented ordered fallback
(keyboard → overlay → auth route → double-tap exit → trail → parent map →
history), RLS and GRANTs cover every public table, and the bundle sits at 118KB
initial against a 180KB budget with the heavy viewers split into lazy chunks.

The one genuine weak spot is structural, not behavioural: 31 files exceed 600
lines and 31 use `as any`. That is the debt that makes every future fix in the
admin and reader surfaces slower and riskier. It is deliberately left scored at
60 rather than papered over.

## Frog's-eye — what changed this pass

1. **Heap poller leaked and stacked (crash shield).** `installMemoryMonitor`
   created a 15s `setInterval` with no handle, so it could never be stopped and
   a second bootstrap (HMR, double mount) stacked a second poller. It also
   polled while the WebView was hidden, spending wakeups on a heap Android had
   already trimmed. Now: single stored handle, early return if already
   installed, skip while `document.hidden`, plus an exported
   `stopMemoryMonitor()` teardown hook.
   Guard: `src/test/crashShield-memory-monitor.test.ts`.

2. **Silent image fallbacks (asset optimization).** `SmartImage` swapped in the
   placeholder without a word, which is how every course cover could 404 for
   weeks while the UI "looked fine". It now warns in dev with the failing URL.
   Guard: `src/test/course-thumbs-exist.test.ts`, which also fails the build on
   dead `*.asset.json` pointer files and on root-absolute image paths missing
   from `public/`.

3. **Dead cross-project asset pointers removed.** `cg-lecturer-batch.jpg.asset.json`
   and `vip-offline-batch-2027.jpg.asset.json` referenced a foreign CDN.

## Scoring honesty notes

Four checks were corrected after review because they measured the wrong thing,
not because the code was wrong:

- The anon/publishable Supabase JWT is meant to ship in the client; only a
  `service_role` reference counts as a leak now.
- `signal.addEventListener("abort", …, { once: true })` self-cleans and no
  longer counts as an uncleaned listener; the check is also scoped to
  component/hook files, since `src/lib` singletons install app-lifetime
  listeners on purpose.
- The back-button chain is detected by its ordered `stepN` decisions rather than
  by the literal word "priority".
- Sub-32px height classes are reported as information, not scored; the mobile
  track now checks the bottom safe-area inset instead.

## Open items (not fixed this pass)

- Split the 31 oversized files, starting with the admin managers and
  `DocumentReader`.
- Replace `as any` with real types, prioritising the Supabase query surfaces.
