# Language Preference (Hindi / Bhojpuri / English)

Students who don't read English get a one-tap language switch right in the sidebar. English stays the default.

## What the user sees

- A **Language** row at the top of the sidebar footer (above the user block), showing a globe icon and the current language name.
- Tapping it opens a compact sheet with three options:
  - English (Default)
  - हिंदी (Hindi)
  - भोजपुरी (Bhojpuri)
- Selection applies instantly across the app — no reload — with selection haptics, and is remembered on next launch (and after app restart on Android).
- The same picker also appears in Settings, so it is discoverable from two places.

## Scope of translation

Phase 1 covers the app shell and student-facing navigation text — the strings a non-English reader hits first:

- Sidebar menu labels, Login/Logout
- Bottom nav / header titles
- Dashboard section headings, common buttons (Continue, Enroll, Download, Retry, Back), empty states, loading and error text
- Landing page nav + CTA labels

Course titles, lesson names, notices and other database content stay as authors wrote them — those are content, not UI, and translating them would need per-row translations. If you want that later, it's a separate step.

## Technical approach

- **No i18n library.** A small `LanguageContext` (mirroring the existing `ThemeContext` pattern) plus a plain-object dictionary keeps the bundle flat — important because the build enforces a 180KB entry budget.
  - `src/contexts/LanguageContext.tsx` — `{ lang, setLang, t }`, persisted via existing `safeGet`/`safeSet` storage helpers, default `en`.
  - `src/i18n/en.ts`, `hi.ts`, `bho.ts` — flat key → string maps. `hi`/`bho` are lazy-imported so English users never download them.
  - `t(key)` falls back to the English string when a key is missing, so a partial translation can never render a blank label.
  - Provider mounted inside `ThemeProvider` in `src/App.tsx`; sets `document.documentElement.lang`.
- **UI:** `src/components/Layout/LanguagePicker.tsx` — sidebar row + shadcn `Sheet` with three options, check mark on active, `selectionHaptic()` on pick. Uses semantic tokens only (`sidebar-foreground`, `primary`), radius/spacing on the existing scale.
- **Strings:** replace hardcoded labels in `Sidebar.tsx`, `Index.tsx` nav, dashboard headings and shared empty/error components with `t("…")`. Keys namespaced (`nav.courses`, `common.retry`).
- **Persistence:** local storage only in this phase. Syncing to the `user_preferences` table can follow once we confirm a suitable column exists — I have not verified that yet, so it is out of scope here.
- **A11y:** picker is a real button with `aria-label`, options are `role="radio"` with `aria-checked`, 44px tap targets.

## Verification

- Build + typecheck clean, entry chunk still under budget.
- Playwright: switch to हिंदी in the sidebar, confirm menu labels change, reload, confirm the choice persisted.
