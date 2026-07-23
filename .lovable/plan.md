# Plan: APK script polish + Bandwidth report

Two independent deliverables in one turn. No app code / UI edits.

---

## Part A — `scripts/build-apk-local.sh` polish (only file touched)

Note: `.github/workflows/build-apk.yml` referenced by the skill does **not** exist in this repo, so nothing to change there. Only the local mirror script drifts from the skill's canonical pins:

| Line | Current | Fix | Why |
|---|---|---|---|
| 7, 12 | Requires/expects Node **22** | Node **24** | Skill pins Node 24 (matches `.nvmrc`/CI stack) |
| 19 | `npm install --legacy-peer-deps ...` | Try `bun install --no-save` first, fall back to npm if `bun` missing | Skill prefers Bun for speed |
| 23 | `npx tsc --noEmit -p tsconfig.app.json` | `bun x tsgo --noEmit -p tsconfig.app.json` (fallback to `npx tsgo` / `tsc`) | Skill hard rule: **never `tsc`, always `tsgo`** |
| — | No APK smoke check | Add grep of `assets/capacitor.plugins.json` + MainActivity present after build | Skill's canonical order includes smoke check |
| — | No `APP_VERSION_NAME` export | Export `APP_VERSION_NAME="${APP_VERSION_NAME:-1.0.0}"` before gradle | Prevents `versionName` = "main" bug documented in `android/app/build.gradle` |

**Explicitly NOT changing:** `--no-daemon`, gradle flags, `minifyEnabled`, Capacitor plugin list, any `android/` file. All per skill's "Edits you must NOT make".

---

## Part B — Bandwidth-maintainer read-only report

Deliver a markdown report at `docs/perf/bandwidth-report-2026-07-23.md`. **No query edits, no column trims.** Report only.

### Baseline captured
- `supabase--slow_queries` top offenders (already collected this turn):

| Query | Calls | Total ms | Mean | Verdict |
|---|---|---|---|---|
| `get_course_lesson_stats()` RPC | 637 | 20 598 | 32.3 | Top offender — needs materialized view (already flagged in prior audit) |
| `profiles` self-lookup (5 cols) | 4 952 | 18 761 | 3.8 | React-Query cache landed last turn — verify drop in 24 h |
| `enrollments + courses` join | 6 566 | 18 470 | 2.8 | Called on every Dashboard render — candidate for cache |
| `lessons WHERE course_id ORDER BY position` | 387 | 14 056 | 36.3 | Newly-added `idx_lessons_course_position` should fix — verify |
| `user_sessions UPDATE last_active_at` | 1 468 | 12 503 | 8.5 | Heartbeat cadence — check interval |

### Column-trim candidates (list-view scans, NO edits — recommendations only)
- `Dashboard` enrollments query already returns `courses(id,title,grade,image_url)` — **good**, keep.
- To verify next turn: `Courses.tsx`, `AllClasses.tsx`, `Materials.tsx`, `Library.tsx` for `select('*')` on `lessons`, `chapters`, `materials`, `books`.

### Egress-channel split
- Ask user to paste 24-h split from Supabase Dashboard → Reports → API/Storage/Realtime so we can confirm PostgREST is still ~95% of egress before proposing Phase-2 trims.

### Verify step
- Re-run `supabase--slow_queries` in 24 h; the profiles self-lookup total should drop from 18.7 s → < 2 s if the cache PR from last turn is holding.

### Guardrails respected
- Zero `select()` edits, zero RLS-scope changes, zero realtime channel changes.
- No proposal to move PostgREST calls into edge functions (same bytes, different meter — skill forbids).

---

## Order of operations (build mode)
1. Rewrite `scripts/build-apk-local.sh` with the 5 changes above.
2. Create `docs/perf/bandwidth-report-2026-07-23.md` with the tables above + a "Verify in 24 h" line.
3. Reply with the skill-mandated "Bandwidth changes" table + skill name.

No typecheck/build needed (bash script + markdown only).
