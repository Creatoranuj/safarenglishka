# QA Click-Through Audit — 2026-09-01

Method: real Chromium session (mobile viewport 420x900), logged in as a student account, clicking the UI like a user. Console errors and HTTP >= 400 responses captured on every step.

## Results

| Screen | Action clicked | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| /login | Email + password + Sign In | Redirect to dashboard | Redirected to /dashboard | Pass |
| /dashboard | Load | Active batch card, resume, carousel | Rendered VIP Offline Batch 2027 | Pass |
| /dashboard | Batch dropdown → select batch | Card updates instantly | Card/title/progress update | Pass |
| /all-classes | Load | Course cards, no redundant "Viewing" strip | Cards only, strip gone | Pass |
| /my-courses | Load | Enrolled batches | 2 batches listed | Pass |
| /downloads | Load | Empty state + Go to Courses | Rendered | Pass |
| /all-tests | Load | Filters + content area | Rendered | Pass |
| /live | Load | Upcoming/empty state | "Koi upcoming class schedule nahi hai." | Pass |
| /profile | Load | Student profile | Rendered | Pass |
| /settings | Load | Settings + language | Rendered | Pass |
| Bottom nav | Load | Hindi labels | होम / कोर्स / मेरे कोर्स / डाउनलोड / प्रोफ़ाइल | Pass |
| /classes/30/chapters | List / Gallery / Table | Layout changes | All three switch | Pass |
| Subject → Zoology (chapter folders) | Gallery | Card grid | Nothing changed | **Fixed** |
| Subject → Zoology (chapter folders) | Table | Table rows | Nothing changed | **Fixed** |
| Chapter → lecture list | Gallery | Card grid | Grid rendered | Pass |
| Chapter → lecture list | Table | Table with TITLE/TYPE/DATE/ACTION | Rendered | Pass |
| Any page | Navigate away and back | View choice remembered | Reset to List | **Fixed** |
| /classes/30/chapter/ZOOLOGY (bad id) | Deep link | Clear not-found message | Blank "No content found" + 400s | **Fixed** |

## Fixes shipped this round

1. `src/components/course/ChapterFolderViews.tsx` (new) — chapter folders rendered as list, 2-column gallery cards, or a table (Code / Chapter / Lectures). Row and card click open the chapter.
2. `src/pages/LectureListing.tsx` — sub-chapter block now renders through `ChapterFolderViews` using the active view; direct lessons of the chapter are shown below the folders in the same view instead of being hidden.
3. View mode persisted in local storage (`lecturelisting:view`), matching `chapterview:view`.
4. Invalid chapter deep links (non-uuid) short-circuit before any query and show a "Chapter not found" screen with a Back to chapters button. Quiz fetch skipped for the same case — the last remaining 400 is gone.

## Verified after fix

- Zoology folder screen: Gallery → 1 grid / 0 tables; Table → 0 grids / 1 table; no console errors, no failed requests.
- Deepest lecture screen: unchanged and still working.
- `vite build` passes with bundle budgets OK; 249 tests pass, 4 skipped.

## Known, not changed (backlog)

- React `forwardRef` warnings still print in dev console from several route-level wrappers (`ProtectedRoute`, `PageLoader`, `BrandMarkInner`, etc.). Cosmetic in dev, no runtime failure.
- God components: `LectureListing.tsx` and a few admin pages exceed 700 lines — decomposition recommended.
- Two player implementations still coexist; consolidation recommended.
