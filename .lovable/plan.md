## Scope

Three tracks in one turn:

1. **Fix Notion 401** (root cause = shared `requireUser` helper) — unblocks Notion link uploads to PDF / Notes / DPP / Test lecture types + 12 other edge functions.
2. **A2 split** — decompose `src/pages/MyCourseDetail.tsx` (1274 LOC).
3. **A3 split** — decompose `src/pages/AdminCMS.tsx` (793 LOC).

---

## Track 1 — Notion 401 root cause fix

**Diagnosis (verified):**
- User pastes published Notion URL in admin uploader for PDF/Notes/DPP/Test → `ContentDrillDown.handleInlineUpload` calls `verifyShareAccess(url)` → hits `notion-page` edge function → returns **401 Unauthorized** → toast says "Notion page is not public".
- Attachments path skips `verifyShareAccess` (files, not URLs), so it works — matches the reported symptom exactly.
- `notion-page/index.ts` uses `requireUser` from `supabase/functions/_shared/auth.ts`, which calls `client.auth.getUser(token)` (remote Auth-server verification). This is the **same stale-session / signing-keys issue** already fixed in `manage-session` and `get-lesson-url` in earlier turns.
- 12 other edge functions share this helper and have the same latent bug: `notify-ai`, `deep-search-lecture`, `seed-knowledge`, `resolve-doubt`, `summarize-video`, `generate-embedding`, `get-zoom-signature`, `chatbot`, `get-video-stream`, `firecrawl-scrape`, `bunny-cdn`.

**Fix:** patch `supabase/functions/_shared/auth.ts` `requireUser()` to use local JWT verification via `anonClient.auth.getClaims(token)` with a fallback to `getUser(token)` only if `getClaims` is unavailable. `requireRole` unchanged (it already delegates to `requireUser`).

**Blast radius:** all 13 functions get the fix in one edit — no need to touch each.

**No new secrets, no schema changes.**

---

## Track 2 — `MyCourseDetail.tsx` split (1274 → ~450 LOC)

Extract into `src/components/course/detail/`:

| New file | Responsibility | Approx LOC |
| --- | --- | --- |
| `useMyCourseDetail.ts` | data-fetching hook (course + chapters + progress + enrollments) | ~250 |
| `SubjectsList.tsx` | top-level subjects grid (already uses `ChapterCard showCode={false}`) | ~150 |
| `ChaptersList.tsx` | drill-down chapter list (uses `ChapterCard showCode={true}`) | ~150 |
| `LessonList.tsx` | lessons under a chapter (video/pdf/notes/dpp/test rows) | ~220 |
| `CourseHeader.tsx` | banner + title + progress ring | ~80 |
| `MyCourseDetail.tsx` (page) | routing/state orchestrator only | ~450 |

Rules:
- Zero behavior change. Same props flow to `ChapterCard` (keeps `showCode` fix intact).
- One file per PR-style edit; typecheck after each.
- Preserve every existing hook order + realtime channel cleanup.

---

## Track 3 — `AdminCMS.tsx` split (793 → ~250 LOC)

Extract into `src/components/admin/cms/`:

| New file | Responsibility |
| --- | --- |
| `HeroBannersTab.tsx` | hero banner CRUD |
| `LandingCoursesTab.tsx` | featured/landing course cards |
| `TestimonialsTab.tsx` | testimonials CRUD |
| `NoticesTab.tsx` | notices CRUD |
| `AdminCMS.tsx` (page) | shadcn `<Tabs>` shell + admin gate |

Same rules as Track 2.

---

## Verification

- `bunx tsgo` after each of the 3 tracks.
- Manual smoke checklist (user-driven):
  1. Paste published Notion URL in admin → PDF / Notes / DPP / Test → should save (no 401).
  2. `/my-courses/:id` renders subjects list (no CH badge) → chapter (CH badge shown) → lesson list.
  3. `/admin/cms` all 4 tabs render + save.
- No new migrations, no new secrets, no dep changes.

## Deferred (mentioned for transparency)

- Skills invoked in the message (`app-crash-shield`, `capacitor-*`, `sentry-triage`, etc.) already covered in phases 1–4 audit reports. No new findings this turn; the two concrete items (Notion, monolith split) are the delta.

## Deliverable

- `docs/audit/2026-07-19-phase5-report.md` — final rollup: Razorpay 5/5, Quiz 5/5, Codebase 5/5, Maintainability 5/5, Notion upload fixed.