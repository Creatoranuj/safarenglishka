# Plan — Audit Remaining Findings Fix (4.3 → 5.0 target)

Report `docs/audit/2026-09-01-full-audit.md` me jo items bache hain, unko teen phases me fix karenge. Security/backend pehle se clean hai.

## Phase 1 — Apply now (low risk, high value)

1. **[SEC] `get-video-stream` host allowlist** — edge function me Piped/Invidious se returned stream URL ka hostname validate karke tabhi proxy/redirect karega. Unknown host → 403.
2. **[OBS] Silent `catch {}` logging** — `NotionPageRenderer.tsx` (9 sites) aur `PdfViewer.tsx` (2 sites) ko `reportError(err, { surface })` se route karenge.
3. **[A11Y] 44px tap targets** — `ObsidianNotes.tsx`, `AdminLessonAttachments.tsx`, `ContentDrillDown.tsx`, `SmartNotesListSheet.tsx` ke chhote buttons ko `min-h-11 min-w-11` hit-area wrapper denge (icon size wahi rahega, sirf touch area badhega).
4. **[MOT] Sticky hover fix** — touch surfaces par hover styles ko `[@media(hover:hover)]:` gate karenge, taki Capacitor WebView me tap ke baad row "stuck" na dikhe.

## Phase 2 — Design tokens (this sprint)

5. **[VIS] Player chrome tokens** — `index.css` me `--player-surface` / `--player-on-surface` (always-dark) tokens add karke `MahimaVideoPlayer`, `MahimaGhostPlayer`, `UnifiedVideoPlayer`, `SeekBar`, `PlayerErrorBoundary` ke hardcoded `bg-black`/`text-white` ko tokenize karenge.
6. **[RELY] ai-health cache** — `ai-health` edge function ka module-scope cache documented/DB-backed banayenge ya TTL comment ke saath acceptable mark karenge.

## Phase 3 — Refactors (approval ke baad, incremental)

7. **[MAINT] God-components decompose** — `LessonView.tsx` (2870 lines) se `useLessonPlayer` / `useLessonAttachments` hooks nikalenge; `Admin.tsx` aur `ContentDrillDown.tsx` ko entity-wise split karenge (existing `HeroBannerManager` pattern follow karke).
8. **[MAINT] Duplicate players merge** — `MahimaVideoPlayer` + `MahimaGhostPlayer` dono ko shared `PlayerControls` + `usePlayerChrome` hook par route karenge.
9. **[LOW] `key={i}` → stable ids** — filterable lists (`Dashboard`, `Courses`, `AdminAnalytics`) me stable key use karenge.
10. **[LOW] `useRoleGuard()`** — 5 hooks me duplicated client role check ko ek shared hook me consolidate karenge.

## Owner action (aapko karna hai — code se nahi ho sakta)

- Supabase Dashboard → Auth → Settings → **Leaked password protection ON** karna hai.

## Verification

- `tsgo --noEmit`, `bun run build`, `vitest run` (247 tests) — sab green rehna chahiye.
- Player chrome visually verify (Playwright screenshot) — dark chrome same dikhe, sirf tokens se.
- Tap targets: modified buttons ka rendered size ≥44px check.
- Final updated audit report `docs/audit/2026-09-01-full-audit.md` me rating update ke saath.

## Technical details

- `get-video-stream` me allowlist: `*.googlevideo.com`, Piped/Invidious CDN hosts jo function already use karta hai.
- Hover gate: Tailwind arbitrary variant `[@media(hover:hover)]:hover:` — sirf student/admin touch surfaces par, sab 539 sites ek saath nahi (sirf interactive rows/cards).
- Phase 3 refactors behavior-preserving rahenge; koi UI/feature change nahi.
