# Capacitor Audit — 2026-09-01

Scope: Admin dashboard (Screenshot 3), landing-page community CTAs, bundle
dynamic-import health, and a full `capacitor-testing` pass.

**Rating: 4/5** — build, typecheck and 253 tests are green, the bundler warning
is gone, and the two reported UX issues are fixed. Held back from 5 by the
remaining below-the-fold items listed under Follow-ups.

## Findings

### [HIGH] [PERF] Ineffective dynamic import inflated the library chunk
**Where:** `src/components/library/personal/AddFromLinkDialog.tsx:22` (static)
vs `src/components/library/personal/FolderView.tsx:243` (dynamic)
**Evidence:** rollup —
`[INEFFECTIVE_DYNAMIC_IMPORT] src/lib/linkOfflineSave.ts is dynamically imported
by FolderView.tsx but also statically imported by AddFromLinkDialog.tsx, dynamic
import will not move module into another chunk.`
**Why it matters:** `linkOfflineSave` pulls in the download + filesystem stack.
One static import hoisted all of it into the library entry chunk, so every user
who opened the library paid for code only the "save offline" action needs.
**Fix:** `AddFromLinkDialog` now resolves it with `await import(...)` inside the
save handler. Build is warning-free.
**Regression guard:** `src/test/ineffective-dynamic-import.test.ts` fails if any
source file adds a static import of a lazy-only module.

### [HIGH] [UX] Landing CTAs popped in abruptly
**Where:** `src/pages/Index.tsx` (single shared `Suspense`),
`src/components/Landing/CommunityStrip.tsx`
**Why it matters:** seven below-the-fold sections shared one `Suspense` with a
`min-h-[200px]` fallback. When the chunk resolved they all mounted at once and
the container grew by well over 2000px — the Telegram / YouTube buttons snapped
into view and the scroll position jumped on Android.
**Fix:** one `Suspense` per section, each with a fallback height matching its
rendered size, plus a 300ms staggered `animate-fade-in-up` on the two CTAs
(YouTube offset 90ms) and a reserved `min-h` on the button row.
`animate-fade-in-up` is already `prefers-reduced-motion`-guarded in `index.css`.
**Regression guard:** `src/test/communityStrip-entrance.test.tsx`.

### [MEDIUM] [UX] Admin dashboard was one long scroll
**Where:** `src/pages/Admin.tsx`
**Why it matters:** the five stat cards and the batch-wise students table were
pinned above the tab strip, so every tab paid their render cost and mobile users
scrolled past them to reach any real work (Screenshot 3).
**Fix:** new **Overview** chip (`LayoutDashboard`) is now the default tab and
owns the stats grid + batch summary. Stat cards keep selection haptics; chips
stay ≥44px with snap scrolling.

## Wins

- Typecheck via `tsgo` clean; `npm run build` clean; **253 tests pass** (30 files).
- `definer-grants.integration.test.ts` already proves 10 SECURITY DEFINER
  functions are not anon-callable — real backend authz coverage, not mocks.
- CI E2E workflow is already Chromium-only (`--project=chromium`) and on
  `actions/upload-artifact@v6`, so signatures S2 and S7 of the CI monitor do not
  apply.
- Tailwind safe-area spacing tokens (`safe-t`/`safe-b`) are defined and used.

## Follow-ups

1. [MEDIUM] [PERF] `Admin.tsx` is ~1300 lines; split each tab body into its own
   lazily-loaded module so the Overview tab does not compile the other panels.
2. [MEDIUM] [OBS] Several hooks still `console.error(err)` directly. Migrate to
   `reportError(err, { surface })` when touching those files.
3. [LOW] [A11Y] Reserved-height `Suspense` fallbacks are `aria-hidden`; consider
   a skeleton that mirrors each section for screen-reader parity.
