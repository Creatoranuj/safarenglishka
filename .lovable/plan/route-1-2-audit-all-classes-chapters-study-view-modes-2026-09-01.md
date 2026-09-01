# Route 1 → 2 Audit (All Classes → Chapters → Study/View modes)

Verified by real logged-in browser clicks (mobile 420px viewport) on the live app.

## What works (verified)

| Step | Result |
|---|---|
| Login (student ID) → `/dashboard` | Works |
| Dashboard → All Classes | Works, batch-filtered (VIP Offline Batch 2027) |
| Course card tap → `/classes/30/chapters?from=all-classes` | Works |
| Chapters list (All Content, Physics, PC/OC/IOC Chemistry, Botany, Zoology) | Correct counts (0/6, 0/4, 0/2) |
| Chapters — List view | Works |
| Chapters — Gallery view | Works (grid cards, "6 lectures · 0 DPPs") |
| Chapters — Table view | Works (CODE / CHAPTER / LECTURES / DONE / DPPS rows) |
| Chapter → Zoology → sub-chapter folders | Works in all 3 views, view choice persists |
| "All Content" → `/classes/30/chapter/__all__` | Works, lists all subjects |
| Network / console on this whole path | No HTTP 4xx/5xx, no runtime errors |

## Issues found

1. **Study Material tab is dead** (`src/pages/ChapterView.tsx`) — the tab renders a hardcoded "No study material available yet." block. It never queries the database, so uploads made in Admin → Study Materials can never appear here. A working list component (`StudyMaterialsList`) already exists and is used on `MyCourseDetail`. Database currently has 1 study material row (course 34), zero for course 30 — so the tab would legitimately be empty for this batch, but it is broken for every course.
2. **Course rows are not keyboard/screen-reader accessible** (`src/pages/AllClasses.tsx`) — both the course card and resource card are plain `div`s with `onClick`, no `role`/`tabIndex`/keyboard handler.
3. **Cosmetic React warnings** — repeated `forwardRef` console warnings remain on the login screen (known backlog, no functional impact).

## Fix plan

1. Wire the Study Material tab in `ChapterView.tsx` to render `<StudyMaterialsList courseId={courseId} chapters={chapters} />` instead of the placeholder, keeping the existing empty-state when there are no rows.
2. Make the All Classes course and resource rows real buttons (`role="button"`, `tabIndex={0}`, Enter/Space handler) without changing the visual design.
3. Re-verify by logged-in click-through: All Classes → Chapters → all three views → Study Material tab (both a course with material, course 34, and one without, course 30), plus build and test run.

## Technical notes

- Chapter routes use UUIDs (`/classes/30/chapter/<uuid>`) plus the `__all__` sentinel; invalid codes already show the "Chapter not found" state.
- View-mode preference is stored under `lecturelisting:view` and correctly restored.
