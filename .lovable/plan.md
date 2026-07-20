## Goal
Make sure the AutoScroll FAB (bottom-right pill) is visible on every long-read surface inside LessonView — Attachment PDF, inline PDF/DPP lesson, Smart Notes, and Test/DPP attempt — and verify live in the deployed preview with the test account.

## Current state (verified by reading source)
- `src/pages/LessonView.tsx`
  - line 1814 — inline PDF/DPP/NOTES lesson mounts `<PdfViewer …>` (alias of `LazyPdfViewer` → `PdfViewerWithAutoScroll`) but **does not pass `alwaysShowFab`**, so its outer chrome timer hides the FAB after 2.5s of idle.
  - line 2380 — Attachment PDF passes `alwaysShowFab`; that path is correct.
  - line 2807 — `<SmartNotesReader>` mounts its own `AutoScrollFab` (verified in `SmartNotesReader.tsx:391`), so Smart Notes is covered.
- `src/components/notes/SmartNotesReader.tsx` — FAB present.
- `src/components/library/DocReaderShell.tsx` — FAB present.
- `src/pages/Downloads.tsx` — `WindowAutoScrollFab` present at line 607.
- Test/DPP attempt surface — need to confirm which component renders the exam view and whether it should carry a FAB (long-scroll question paper vs. one-question-at-a-time).

## Fix
1. Pass `alwaysShowFab` to the inline PDF/DPP/NOTES mount in `LessonView.tsx` (line 1814) — same rule already documented in `mem://features/autoscroll-fab`.
2. Locate the Test/DPP attempt surface. If it is a long-scroll page, wrap it with `WindowAutoScrollFab` (bottom offset above the submit bar). If it is one-question-per-screen, leave it as-is and note the reason.
3. No other reader surfaces change.

## Verify (Playwright, headless Chromium against `http://localhost:8080`)
Login with `shomarnashaurya@gmail.com` / `Ceoraj26`, then open a lesson from Amar Batch → Tense chapter and screenshot each tab:
- Attachment tab → assert `[aria-label="Start autoscroll"]` visible, screenshot.
- Smart Notes tab → assert FAB visible, screenshot.
- Inline PDF lesson (a PDF-type lesson) → assert FAB visible, screenshot.
- Test/DPP attempt (if long-scroll) → assert FAB visible, screenshot.
- Downloads route → assert FAB visible, screenshot.

Report each result with the screenshot path; fail loud if any surface is missing the FAB.

## Memory
Append to `mem://features/autoscroll-fab`: "Inline PDF/DPP/NOTES lesson mount in LessonView must also pass `alwaysShowFab` — same reason as the Attachment tab (outer chrome auto-hide masks the FAB otherwise)."

## Out of scope
- No visual redesign of the FAB, no changes to `AutoScrollFab.tsx` behavior.
- No changes to Downloads / SmartNotes / DocReaderShell mount sites.
- Credentials are used only for this verification run and never logged or screenshotted.