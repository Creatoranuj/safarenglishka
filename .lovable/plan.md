# Senior Architect Audit + Fix Plan

**Scope:** 8 user-reported issues across PDF viewer, navigation, bottom nav, gestures, performance, CDN delivery, and sorting.

---

## Findings & Fixes

### 1. [HIGH] [UX] Back button broken in PDF fullscreen

**Where:** `src/hooks/useFakeFullscreen.ts`, `src/components/video/FastPdfReader.tsx`, `src/hooks/useAndroidBackButton.ts`
**Why:** When PDF enters fake-fullscreen, the Android/browser back press isn't intercepted to exit fullscreen first — it either does nothing or pops history past the reader.
**Fix:** Push a history sentinel on fullscreen-enter (reuse `useOverlayHistorySentinel`); on back, exit fullscreen and consume the event. Listen to `nb:back` before the route-level handler.

### 2. [HIGH] [UX] Lesson attachments must open INLINE (revert hybrid OS handoff)

**Where:** `src/lib/openPdfHybrid.ts`, `src/pages/LessonView.tsx` (attachment chip handlers)
**Why:** `openPdfHybrid` currently hands off to OS reader / external browser on native. User wants the previous inline `PdfViewer` behavior restored for the attachment section.
**Fix:** Bypass `openPdfHybrid` for the Attachments section in LessonView — always mount `DocReaderShell` / `PdfViewer` inline like Notes/DPP. Keep hybrid for Downloads page only (or remove entirely if not needed elsewhere).

### 3. [CRITICAL] [UX] Back button loops, app won't exit

**Where:** `src/hooks/useAndroidBackButton.ts`, `src/config/backNavigation.ts`, `src/components/ExitHint.tsx`
**Why:** Resolver falls through prefix rules → STATIC_PARENT_MAP → fallback in a way that re-enters a route already in history, creating a loop. Exit confirmation only fires on EXIT_ROUTES, but redirects past them break the double-tap window.
**Fix:** Add loop detection (if next target == current path or recently visited within 500ms → force exit hint). Ensure `/dashboard`, `/`, `/index`, `/admin` always trigger exit-hint regardless of redirect timing. Audit `peekPrevious()` to avoid `navigate(-1)` re-entry on the same path.

### 4. [MEDIUM] [UX] Freeze bottom navigation (always visible, not scroll-hidden)

**Where:** `src/components/Layout/BottomNav.tsx`
**Why:** `nb-hide-on-kb` + `chat-fullscreen-open` mutation observer hides nav. User wants it pinned always (except keyboard / chat full-screen which are correct).
**Fix:** Audit any CSS that translates/hides BottomNav on scroll — remove scroll-hide behavior. Keep keyboard and chat-fullscreen suppression. Confirm `position: fixed` is intact and no parent has `transform` breaking it.

### 5. [MEDIUM] [UX] Swipe-right to go back (edge gesture)

**Where:** new hook `src/hooks/useSwipeBack.ts`, mount in `src/App.tsx`
**Why:** No global edge-swipe handler today.
**Fix:** Add a global touchstart/touchmove listener: if touch starts within 20px of the left edge and swipes right >80px with low vertical drift → trigger same logic as BackButton (peek history → navigate(-1) or fallback). Disable inside PDF reader / video player to avoid conflict.

### 6. [HIGH] [PERF] Lesson view slow to open

**Where:** `src/pages/LessonView.tsx`, `src/hooks/useLessonAttachments.ts`, `useLessonPdfs`, `useLessonNotes`, `useLessonMarkers`, `useLessonBookmarks`, `useLessonLikes`
**Why:** Likely 6+ sequential Supabase queries on mount, no parallelization / caching, large bundle, no skeleton on initial paint.
**Fix:** (a) Wrap all lesson-scoped queries in a single `Promise.all` or rely on react-query parallel mode with `staleTime: 60_000`; (b) prefetch on lesson card hover/tap via `queryClient.prefetchQuery`; (c) lazy-load heavy reader components with `React.lazy`; (d) show skeleton immediately, don't block on attachments.

### 7. [CRITICAL] [SEC/UX] cdn.jsdelivr / CDN PDFs redirect to web instead of in-app

**Where:** `src/lib/openPdfHybrid.ts`, `src/components/course/SheetViewer.tsx`, `src/lib/pdfViewerUrl.ts`
**Why:** Remote PDF URLs (especially CDN-hosted notes) fall into the iframe / external browser branch. On Android WebView this opens the system browser instead of staying in-app.
**Fix:** Route all PDF URLs through `useLocalPdfSource` → fetch as blob → `blob:` URL → `FastPdfReader`. Block the external-browser branch in `openPdfHybrid` for CDN/HTTPS PDF mime. Add CORS-safe fetch with fallback to signed-URL proxy edge function if cross-origin fetch fails.

### 8. [MEDIUM] [FEATURE] Sort/filter in Courses & My Courses (lecture / notes / DPP / PDF + newest/oldest)

**Where:** `src/pages/Course.tsx`, `src/pages/MyCourseDetail.tsx`, `src/pages/LectureListing.tsx`, new `src/components/course/SortFilterBar.tsx`
**Fix:** Add a sticky filter bar with two controls: (a) Type pills (All / Lectures / Notes / DPP / PDF), (b) Sort dropdown (Newest / Oldest). Persist selection per course in `sessionStorage`. Filter/sort the merged items list before render.

---

## Wins

- PDF system already has IndexedDB + Filesystem tiers with crash telemetry — solid foundation.
- BackButton uses real navigation stack via context — correct pattern.
- Lesson hooks are split per resource — easy to parallelize.

## Fix Order

1. **Now (CRITICAL):** #3 back-button loop, #7 CDN inline delivery, #2 attachments inline.
2. **This pass (HIGH):** #1 fullscreen back, #6 LessonView perf.
3. **Polish (MEDIUM):** #4 bottom nav freeze, #5 swipe-back, #8 sort/filter UI.

## Open Questions

- For #7, do you want a Supabase edge-function proxy if CORS blocks direct fetch from CDN, or is whitelisting CORS on your CDN acceptable?
- For #5, should swipe-back be enabled globally or only on detail pages (lesson, course, profile)?
- For #8, should the filter remember globally or reset per course visit?

&nbsp;

when required to use Must Use Capicitor skill  
**Progress tracker:**  
- [ ] 1. webapp-to-capacitor  
- [ ] 2. capacitor-best-practices  
- [ ] 3. capacitor-deep-linking  
- [ ] 4. capacitor-keyboard  
- [ ] 5. capacitor-offline-first  
- [ ] 6. capacitor-performance  
- [ ] 7. capacitor-plugins  
- [ ] 8. capacitor-security  
- [ ] 9. capacitor-splash-screen  
- [ ] 10. capacitor-testing  
- [ ] 11. debugging-capacitor  
- [ ] 12. ionic-design  
- [ ] 13. ios-android-logs  
- [ ] 14. safe-area-handling  
- [ ] 15. tailwind-capacitor  
- [ ] 16.capacitor-back-button  
- [ ] 17.asset-optimization  
- [ ] 18.senior-architect-audit  
- [ ] 19.capacitor-video-player-master  
- [ ] 20.app-crash-shield