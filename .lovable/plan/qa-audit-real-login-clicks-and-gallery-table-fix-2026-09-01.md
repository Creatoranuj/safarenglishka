# QA Audit (real login + clicks) and Gallery/Table Fix

I signed in with the student account in a real browser and clicked through the app. Below is what I found, then what I will fix.

## What I verified by clicking (evidence)

Working:
- Login (email + password) → lands on Dashboard
- Dashboard, All Classes, My Courses (2 batches visible), Downloads (empty state), Profile, Settings, All Tests, Live — all load, no failed network calls, no runtime console errors
- Bottom navigation in Hindi (होम / कोर्स / मेरे कोर्स / डाउनलोड / प्रोफ़ाइल)
- Subject list page (`/classes/30/chapters`): List, Gallery and Table all switch correctly
- Deepest chapter page (lectures list): Gallery works, Table works (renders TITLE / TYPE / DATE / ACTION)

Broken (reproduced, matches your screenshot):
- **Subject page showing chapter folders** (e.g. Zoology → "2 : Body Fluids And Circulation"): clicking Gallery or Table changes nothing. The chapter-folder block is rendered by a separate branch that ignores the selected view, and the whole content area below it is skipped when folders are present.
- **View choice is not remembered** on the lecture/chapter listing page — it resets to List on every navigation (the subject list page does remember it).
- Opening a chapter by its code instead of its id (e.g. `/classes/30/chapter/ZOOLOGY`) produces repeated 400 responses and a bare "No content found" screen instead of a proper not-found message.

## Fixes planned

1. Chapter-folder view respects the switcher
   - Gallery: 2-column folder cards with thumbnail/code tile, title, lecture count.
   - Table: rows with Code, Chapter, Lectures, DPPs — row click opens the chapter.
   - List: current folder rows (unchanged look).
2. Keep the sub-chapter block and the lessons block both visible when a chapter has folders *and* direct lessons, so nothing is hidden.
3. Persist the selected view (`list` / `gallery` / `table`) for the lecture listing page in local storage, same key style as the subject page, so the choice survives navigation.
4. Guard invalid chapter ids: if the id is not a valid chapter, show a clear "Chapter not found — go back" state instead of firing failing queries.

## Full audit deliverable

A markdown report at `docs/audit/2026-09-01-qa-clickthrough.md` in table format: Screen → Action clicked → Expected → Actual → Status (Pass / Fail / Fixed), covering auth, dashboard, batch switch, all-classes, subject → chapter → lecture drill-down, view switcher, video/PDF open, downloads, tests, live, profile, settings, language switch and chatbot. Anything found failing beyond the four items above gets listed with a recommendation rather than a silent change.

## Technical notes

- Files touched: `src/pages/LectureListing.tsx` (view-aware sub-chapter rendering, view persistence, invalid-id guard), possibly a small shared `ChapterFolderViews` block reused by `src/pages/ChapterView.tsx` to avoid duplicating gallery/table markup.
- No database, RLS or edge-function changes.
- Verification: rebuild, run the existing test suite, then re-run the logged-in click-through and confirm Gallery/Table change the layout on the Zoology folder screen.
