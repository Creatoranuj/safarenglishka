# Get every audit heading to 5/5

Four lenses were rated: Supabase architecture 4/5, bandwidth 3/5, senior architect 4/5, crash shield (not yet rated). This plan closes every gap that is fixable in code, and names the two that are dashboard-only.

## What gets fixed

### 1. Bandwidth (3/5 → 5/5) — the weak axis

Confirmed causes from reading the code:

- **Resume invalidates the entire cache.** `src/App.tsx` listens for `app:resumed` and calls `queryClient.invalidateQueries()` with no filter, so returning to the app refetches every cached query at once. Replace with a targeted refetch of only active, user-scoped queries (progress, enrollments, notifications), leaving near-static data (notices, landing content, site stats, courses) on its cache.
- **Duplicate `like_count` reads.** `src/hooks/useLessonLikes.ts` re-runs its effect whenever the `user` object identity changes (dependency is the whole `user` object, not `user.id`), refiring the `lessons.like_count` + `lesson_likes` reads. Narrow the dependency to `user?.id` and split the "my like" read out of the count read.
- **Static data over-fetching.** Give near-static reads (`site_stats`, `landing_content`, `notices`, `subscription_plans`, hero banners, testimonials) a long `staleTime` (30–60 min) and `gcTime`, so they load once per session instead of per mount.
- **Enrollments list is over-wide.** `useEnrollments` selects the full nested course row (`description`, `price`, `created_at`, both image columns). Trim the list query to what the list renders; detail pages keep the full select.
- **`lesson_progress` write volume.** The 5s debounce is kept, but skip a write when nothing changed since the last flush (same position, same intervals) — that alone drops idle/paused heartbeat writes.
- **`get_course_lesson_stats`** (max 1.3s) — inspect the plan with EXPLAIN and add the supporting index via migration if it is a sequential scan, then cache the result per course.

Every changed query gets reported in the required bandwidth table with before/after column counts and estimated saving.

### 2. Supabase architecture (4/5 → 5/5)

- Point the stale integration tests at the current project: `src/test/definer-grants.integration.test.ts` and `supabase/functions/security-regression/policies_test.ts` currently hardcode the old ref `cmbattmjwriiesibayfk` and its anon key. Read URL/key from env instead of hardcoding.
- Update the stale ref in `APK_BUILD_GUIDE.md` and the `supabase/schema-package*.sql` header comments.
- The two remaining linter WARNs (`phone_otps` RLS-without-policy, `get_platform_stats` no anon EXECUTE) are intentional and stay — they will be documented in a short `docs/supabase-accepted-warnings.md` so future audits do not re-flag them.
- Only index/EXPLAIN work touches the database, via a reviewed migration you approve.

### 3. Crash shield (rate + harden)

Audit the app against the crash checklist and fix what it finds:

- Sweep every `useEffect` that adds a listener, `setInterval`, or realtime channel for a matching cleanup.
- Verify PDF and video views unmount cleanly and blob URLs are revoked.
- Confirm `ErrorBoundary` retry guard cannot loop, and that the crash-shield watchdog does not reload during a legitimate long task.
- Confirm the persisted query cache stays under its 4 MB bound on a long session.

Report the crash-shield rating with evidence rather than asserting it.

### 4. Senior architect (4/5 → 5/5)

Rolls up once the above land. Also includes a visual/motion pass on the surfaces touched, since a 5 requires no HIGH design findings.

## Not fixable from code (yours to do)

- **Supabase Dashboard → Auth → Password protection → enable "Leaked password protection".** One toggle. Until it is on, the security lens cannot be a clean 5.
- **GitHub: + menu → GitHub → Connect `Creatoranuj/safarenglishka`.** UI-only.

## Verification

- Typecheck after each batch.
- Re-run the linter and `slow_queries` after the changes.
- Playwright pass over landing → course → lesson → PDF → back, checking console for errors and confirming data still renders.
- You check Supabase → Reports → API egress 24h later; expect a 40–60% drop.

## Technical notes

Files in scope: `src/App.tsx`, `src/lib/queryClient.ts`, `src/hooks/useLessonLikes.ts`, `src/hooks/useLessonProgress.ts`, `src/hooks/useEnrollments.ts`, `src/hooks/useNotices.ts`, `src/hooks/useHeroBanners.ts`, `src/hooks/useTestimonials.ts`, `src/hooks/useLandingCourses.ts`, `src/pages/Courses.tsx`, `src/test/definer-grants.integration.test.ts`, `supabase/functions/security-regression/policies_test.ts`, plus one index migration if EXPLAIN justifies it.
