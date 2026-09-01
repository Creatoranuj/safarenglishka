# Hero Social Links + Lint Error Cleanup

## 1. Hero badges → YouTube & Telegram links

In `src/components/Landing/HeroIllustration.tsx` the two floating badges (green play, blue paper-plane) are decorative `aria-hidden` divs today.

- **Green play badge** → `<a href="https://youtube.com/@safarenglishka">` (YouTube channel)
- **Blue plane badge** → `<a href="https://t.me/safarenglishka">` (Telegram channel)
- Both: `target="_blank" rel="noopener noreferrer"`, proper `aria-label` ("Safar English on YouTube" / "Safar English on Telegram"), keep the existing bounce animation + shadow styling, add `active:scale-95` press feedback and a light `selectionHaptic()` on tap (consistent with the chat bubbles).
- Keep them positioned exactly as now (visual design unchanged) — only they become real, accessible links.

## 2. Lint status (measured live)

`npx eslint src` → **548 problems: 33 errors, 515 warnings.**

Warnings breakdown: 436 `no-explicit-any` (warn-by-project-policy), 40 `react-hooks/exhaustive-deps` (warn), ~30 `no-console` (warn, CI budget-guarded). These are tracked debt, not build blockers.

**The 33 errors are real bugs worth fixing now**, grouped by file:

| File | Errors | What |
|---|---|---|
| `components/library/personal/FolderGrid.tsx` | 7 | Conditional `useState`/`useEffect` calls (rules-of-hooks) — can crash on re-render |
| `hooks/useLessonBookmarks.ts` | 4 | Conditional hook calls — same crash risk |
| `components/video/FastPdfReader.tsx` | 1 | Guardrail violation: imports native browser bridge on a PDF surface (can eject users to system browser) |
| `hooks/useLessonProgress.ts`, `useProfiles.ts`, `useStudyMaterials.ts`, `pages/AdminStudyMaterials.tsx` (2), `pages/LessonView.tsx`, `components/*` (SmartNotesListSheet, FolderView, UniversalFileViewer, MarkdownViewer ×2, FormatFilterChips) | ~14 | `preserve-caught-error` (rethrown errors lose `cause`), `no-useless-escape`, unused-expression, create-component-in-render |
| `lib/native/*`, `services/*`, `utils/fileUtils.ts`, `test/pdfViewer-regression.test.tsx` | ~7 | `preserve-caught-error`, `no-require-imports` in tests |

## 3. Fix plan

1. **Rules-of-hooks (11 errors)** — restructure `FolderGrid.tsx` and `useLessonBookmarks.ts` so hooks run unconditionally (move early returns below hook calls / hoist state). These are the highest-value fixes: conditional hooks cause "Rendered more hooks than during the previous render" crashes.
2. **FastPdfReader guardrail** — remove the `native/browser` import and route through the allowed `openResource()` funnel (per the eslint rule message).
3. **preserve-caught-error (5)** — add `{ cause: err }` to rethrown errors so Sentry keeps the original stack.
4. **Small fixes** — `no-useless-escape` regex cleanups, the unused expression in `FormatFilterChips`, component-created-in-render, and unused eslint-disable directives.
5. **Leave as-is (tracked debt, warn-level):** 436 `no-explicit-any` and 40 `exhaustive-deps` — converting all of these in one pass is high-churn/low-value; they stay warn-only per project policy.

## 4. Verify

- `npx eslint src` → errors must drop from 33 → 0 (warnings unchanged except removed cheap classes).
- `npx tsgo` typecheck clean.
- `bun run build` succeeds (bundle budget intact).
- Playwright: load landing page, click the play badge → opens YouTube channel in new tab; plane badge → opens Telegram; no console errors.

## Out of scope

- Mass `any`-type refactor (436 warnings) — separate effort if you want it later.
- DB content translation (from the language plan) — untouched.
