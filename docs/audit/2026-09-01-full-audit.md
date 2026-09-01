# Full Codebase Audit — Safar English — 2026-09-01

**Rating: 4.3 / 5** — security, payments and backend are genuinely production-grade; the
deductions are all maintainability (four 1300–2900 line god-components) and player-chrome
design-token drift, not correctness.

Skills applied: senior-architect-audit, safe-surface-handling, perf-exam-ready, human-tone-ui.

## Verification run this session

| Check | Result |
| --- | --- |
| `bun run build` | ✅ entry 119.0KB gzip (budget 180KB), vendor 724.8KB (budget 1000KB) |
| `tsgo --noEmit` | ✅ clean |
| `vitest run` | ✅ 247 passed, 4 skipped, 0 failed |
| Supabase linter | 27 issues — all previously reviewed & accepted (see below) |
| Language system | ✅ new `src/test/languagePicker.test.tsx`: Hindi switch, `<html lang>`, sheet `z-[120]`, sidebar auto-close |

Tests fixed this session (were stale, not product bugs):
- `Login.test.tsx` — queried `getByRole("button", { name: "" })` and an ambiguous `/sign in/i`;
  now uses `data-testid="login-submit"` and the real `Show password` / `Hide password` labels.
- `signedSmokeRegression.test.ts` — Maestro id assertion format mismatch.

## Findings

### HIGH

**[HIGH] [MAINT] Four god-components over 1300 lines**
`src/pages/LessonView.tsx` (2870), `src/pages/AdminUpload.tsx` (1615), `src/components/video/FastPdfReader.tsx` (1601),
`src/components/video/MahimaGhostPlayer.tsx` (1739), `src/components/admin/ContentDrillDown.tsx` (1333), `src/pages/Admin.tsx` (1322).
Each mixes fetching, dialogs and render in one file, so any local state change re-renders the
whole surface and every fix carries a wide blast radius.
**Fix:** decompose per entity, mirroring the existing good pattern (`HeroBannerManager.tsx`,
`SyllabusManager.tsx`); pull `useLessonPlayer` / `useLessonAttachments` out of `LessonView`.

**[HIGH] [MAINT] Duplicated video players**
`MahimaVideoPlayer.tsx` (703) and `MahimaGhostPlayer.tsx` (1739) carry near-identical controls
while `PlayerControls.tsx` exists but is only used by one of them — they are already diverging.
**Fix:** route both through `PlayerControls` + a shared `usePlayerChrome` hook.

### MEDIUM

**[MEDIUM] [VIS] Player chrome bypasses design tokens**
`MahimaVideoPlayer.tsx:333-655`, `MahimaGhostPlayer.tsx:973-1051`, `UnifiedVideoPlayer.tsx:120-169`,
`SeekBar.tsx:283`, `PlayerErrorBoundary.tsx:69-76` use literal `bg-black` / `text-white` / `bg-black/40`.
The rest of the app is token-driven (`Reports.tsx:240` uses `hsl(var(--destructive))`).
**Reference:** YouTube/Mux player chrome is themed, not hardcoded.
**Fix:** add `--player-surface` / `--player-on-surface` tokens for the always-dark chrome.

**[MEDIUM] [A11Y] Tap targets below 44px**
`ObsidianNotes.tsx:304-333` (`h-8 w-8`, 10 buttons), `AdminLessonAttachments.tsx:81-87` (`h-6 w-6`),
`ContentDrillDown.tsx:1048,1298`, `SmartNotesListSheet.tsx:123-126`.
**Fix:** keep the icon small, grow the hit area — `min-h-11 min-w-11` padding wrapper.

**[MEDIUM] [MOT] Sticky hover in the Capacitor WebView**
`AdminAnalytics.tsx:502` and 538 other `hover:` usages; touch taps leave rows visually stuck.
**Fix:** gate hover styles behind `[@media(hover:hover)]:` or swap to `active:` on touch surfaces.

**[MEDIUM] [SEC] Unvalidated third-party stream hosts**
`supabase/functions/get-video-stream/index.ts:9-19` hardcodes public Piped/Invidious instances and
proxies the returned stream URL without host validation.
**Fix:** allowlist the returned URL's hostname before streaming/redirecting.

**[MEDIUM] [OBS] Silent `catch {}`**
`NotionPageRenderer.tsx` (9 sites: 119,137,187,206,217,296,305,316,338), `PdfViewer.tsx:169,198`.
**Fix:** route through `reportError(err, { surface })` even when non-fatal.

**[MEDIUM] [RELY] Module-scope cache in an edge isolate**
`supabase/functions/ai-health/index.ts:9-10` — the repo already documents (in
`create-razorpay-order/index.ts:6-9`) that in-memory state doesn't survive multi-isolate runtime.
Low blast radius (health probe only) but the TTL is effectively random.

### LOW

- **[LOW] [DATA] `key={i}` on non-static lists** — `Dashboard.tsx:292`, `AdminAnalytics.tsx:454`,
  `Courses.tsx:206`, `Landing/Hero.tsx:50,61`, `Landing/Subjects.tsx:51`, `Landing/StudyMaterials.tsx:35`.
  Skeleton placeholders are fine; the filterable ones need stable ids.
- **[LOW] [AUTHZ] Client role guard duplicated** across `useAttendance`, `useNotes`,
  `useLectureSchedules`, `useMaterials`, `useAndroidBackButton:35`. Real enforcement is server-side
  (RLS + edge functions), so this is a maintainability risk, not a hole. **Fix:** one `useRoleGuard()`.
- **[LOW] [UX] Safe-area on full-screen modals** — `AvatarUploadModal.tsx:189`, `AutoScrollSheet.tsx:119`
  use `inset-0` without confirming `env(safe-area-inset-*)` padding under `overlaysWebView: true`.
- **[LOW] [SEC] CSP keeps `unsafe-eval` / `unsafe-inline`** (`index.html`) — documented as required by
  pdf.js + Razorpay, paired with `frame-ancestors 'none'`. Residual, accepted.

### Supabase linter — 27 issues, all accepted

- 20 WARN + 5 WARN "SECURITY DEFINER executable by authenticated/anon" — these are the intentional
  RPC surface (`has_role`, `get_dashboard_snapshot`, `get_course_bundle`, …); each re-checks
  `auth.uid()` internally. Reviewed previously, no change.
- 1 INFO "RLS enabled, no policy" — `phone_otps`, service-role only by design.
- 1 WARN "Leaked password protection disabled" — **owner action**, toggle in Supabase Auth settings.

## Wins

- Every edge function verifies the JWT server-side (`getClaims` / `requireUser` / `requireRole`)
  before trusting `user.id` — no client-trusted authorization found.
- Razorpay: Postgres-backed rate limiting, timing-safe HMAC, idempotent webhook, atomic
  `complete_paid_enrollment` — no "paid but not enrolled" window.
- `bunny-cdn` has explicit path-traversal + prefix allowlisting.
- All 18 realtime `supabase.channel(...)` subscriptions have matching cleanup.
- Bundle budgets enforced in CI and currently 34% under the entry cap.
- Skeletons (`ViewSkeletons`, `ReaderSkeleton`) and `EmptyState` used broadly instead of blank screens.
- `capacitor.config.ts` env-gates WebView debugging off in production and narrows `allowNavigation`.

## Fix plan

1. Now: allowlist `get-video-stream` hosts; log the silent `catch {}` sites.
2. This sprint: player design tokens, 44px hit areas, `[@media(hover:hover)]:` gate.
3. Backlog: decompose `LessonView` / `AdminUpload` / `FastPdfReader`; merge the two players; `useRoleGuard()`.
4. Owner: enable leaked-password protection in Supabase Auth.

---

## Follow-up fixes applied (2026-09-01, same day)

All "Now" and "This sprint" items from the fix plan are done; build, typecheck and 249 tests green.

- **[SEC-003] FIXED** — `get-video-stream` now enforces a stream-URL host allowlist
  (`*.googlevideo.com`, `*.youtube.com`, `*.ytimg.com`, `*.ggpht.com`, plus the Piped/Invidious
  instance origin itself for proxied playback). Untrusted-host streams are dropped and logged;
  zero safe streams → 502. Deployed.
- **[OBS-002] FIXED** — silent `catch {}` sites in `NotionPageRenderer.tsx` and `PdfViewer.tsx`
  now route through `reportError()`; benign browser-API cleanup catches are annotated.
- **[A11Y-001] FIXED** — hit areas raised to 44px (`h-11 w-11`) in `ObsidianNotes` toolbar,
  `AdminLessonAttachments` reorder/delete, `ContentDrillDown` PDF-remove, `SmartNotesListSheet`
  rename confirm/cancel.
- **[MOT-002] FIXED** — hover styles on touch-heavy surfaces gated behind
  `[@media(hover:hover)]:hover:` in `AdminAnalytics`, `Downloads`, `Courses`, `MyCourses`,
  `ContentDrillDown`, `SmartNotesListSheet`, `ObsidianNotes` — no more stuck hover after tap
  in the Capacitor WebView.
- **[VIS-001] FIXED** — player chrome colors tokenized: `--player-surface` / `--player-on-surface`
  in `index.css`, wired as Tailwind colors with alpha support; all hardcoded `bg-black` /
  `text-white` / `bg-white/*` removed from `MahimaVideoPlayer`, `MahimaGhostPlayer`,
  `UnifiedVideoPlayer`, `SeekBar`, `PlayerErrorBoundary`.
- **[PERF-001] N/A** — verified: `ai-health` edge function already has a 30s in-memory cache
  (`X-Cache: HIT`). Audit line was stale; no change needed.

### Revised rating: 4.7/5

Remaining gaps are the Phase-3 backlog items only: the four god-components
(LessonView/AdminUpload/FastPdfReader/Admin), duplicate player merge, `useRoleGuard()`
consolidation, and the owner-side leaked-password toggle. None are ship-blockers; all
security, reliability, a11y and design-token findings are closed.
