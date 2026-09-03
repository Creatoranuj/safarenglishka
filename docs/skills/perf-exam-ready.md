# Skill: perf-exam-ready

**Goal:** exam week is the slowest phone on the worst network. The budget is the promise.

## Rules
1. Bundle budgets are enforced by `scripts/check-bundle-size.mjs`: initial entry ≤ 180 KB, vendor total ≤ 1 MB. Guard: `perf-budget` (blocking).
2. Heavy route panels (`HeroCarousel`, `UpcomingLiveSessions`, `UpcomingSchedule`, PDF reader, player) are `lazy()` behind `Suspense` skeletons — the first frame is header + active course only.
3. No layout thrash in scroll handlers; autoscroll uses rAF and a resolved scroll host.
4. Lists over ~50 rows virtualize.
5. Images: explicit dimensions, lazy below the fold, preloaded for LCP.
6. Measure before and after with the real APK on a low-end device — not devtools throttling alone.

## Repo anchors
`scripts/check-bundle-size.mjs`, `src/pages/Dashboard.tsx`, `src/hooks/useAutoScroll.ts`
