## Walkthrough: App Crash Shield + Web→Capacitor (read-only audit)

Scope: verify current project against both skills. **No files will be edited.** Deliverable is this findings report; anything to actually change is listed at the end and only executed after you approve.

---

### Project snapshot (verified from repo)

- Stack: Vite + React + TS, Capacitor 7, target `com.safarenglishka.app` / "Safar English", `webDir: dist`.
- Native platforms present: `android/` (yes), `ios/` (not in repo root).
- 60+ pages incl. Admin, Live, Quiz, PDF/Books, Video, Payments, Push, SQLite, Downloads, Delete-Account.
- Skill anchor files already exist: `src/lib/crashShield.ts`, `src/components/ErrorBoundary.tsx`, `src/lib/perf/queryPersister.ts`, `src/hooks/useResumeRecovery.ts`.
- Capacitor plugins in use: App, Browser, Camera, SQLite, Device, Filesystem, Haptics, InAppBrowser, Keyboard, LocalNotifications, Network, Preferences, PushNotifications, ScreenOrientation, Share, SplashScreen, StatusBar, Toast, PrivacyScreen, FileOpener, FileViewer.

---

### Part 1 — App Crash Shield walkthrough

Sections below correspond 1:1 to the skill's root-cause checklist. Each is a check I will perform; nothing is changed yet.

1. **Memory pressure (OOM)** — highest crash risk given PDF + Video + Live surfaces.
   - Confirm `react-pdf` pages unmount on route change (Books, ChapterView, Materials, LessonView, Downloads).
   - Confirm `MahimaGhostPlayer` releases the YouTube iframe on unmount and on rotation cycles.
   - Grep for `URL.createObjectURL` without matching `revokeObjectURL` (PDF blobs, downloads).
   - Inspect `queryPersister.ts` bounds — verify max size + throttled write.
2. **Unhandled promise rejections** — verify `crashShield.ts` registers `unhandledrejection` + `error` global handlers and is imported in `main.tsx`.
3. **Event-listener leaks** — audit `useEffect` for `App.addListener('backButton'|'appStateChange'|'resume')`, `window.addEventListener('resize'|'visibilitychange'|'orientationchange')`, screen-orientation listeners across pages that mount/remount (LiveClass, Video, PDF).
4. **Frozen main thread** — scan for large sync work in render / effects (JSON parses, big loops, sync `localStorage` bursts in hot paths).
5. **WebView killed while backgrounded** — verify `useResumeRecovery` refetches stale queries and re-establishes Supabase realtime channels on `appStateChange { isActive:true }`.

Diagnose-live commands from the skill I will document (not run) for your device:
```
adb logcat | grep -iE "AndroidRuntime|chromium|WebView|lowmemorykiller|safarenglish"
adb shell dumpsys meminfo com.safarenglishka.app
adb shell am send-trim-memory com.safarenglishka.app COMPLETE
```

Verification routine (skill's "Verify a fix"):
- 20× loop through Book → PDF → Video → back.
- `send-trim-memory COMPLETE` must not kill app.
- 10-min background → resume → input < 2s.

---

### Part 2 — Web→Capacitor walkthrough

Applied to the **current** state (this is a converted web app, not a fresh migration), so each step becomes a compliance check.

1. **Static build readiness** — `webDir: dist` ✅. Confirm no server-only imports leak into client bundle; check `postbuild` size guards (already present: 180 KB entry / 280 KB chunk).
2. **Capacitor integration** — config reviewed ✅. Notes:
   - `allowNavigation` list is properly narrowed (good — Supabase already removed).
   - `PrivacyScreen.enable:false` intentional (JS-controlled) ✅.
   - `SplashScreen.launchAutoHide:false` with JS hider ✅.
   - `StatusBar.overlaysWebView:true` — verify every page uses `env(safe-area-inset-top)`.
3. **Native-feeling polish (store-reject risk)** — spot-check:
   - Safe-area top/bottom on: Login, Dashboard, LiveClass, video landscape, PDF viewer, Admin.
   - Keyboard-safe forms: PhoneLogin, ForgotPassword, ResetPassword, Doubts, Community post.
   - Back-button behavior: does hardware Back close modals / navigate up instead of exiting mid-flow?
   - Landscape/rotation for Video + Live only, locked elsewhere.
   - Splash → first paint has no white flash.
   - Offline + error states on Downloads, Live, Payments.
4. **Web→Native capability mapping** — audit each permission has an in-context prompt (Camera, Notifications, Storage) and a graceful "denied" path.
5. **Store readiness** — pre-submission risk list:
   - Apple: demo credentials + demo mode? Sign-in-with-Apple parity if any third-party login? Account deletion route (`DeleteAccountPublic.tsx` exists ✅ — verify it's reachable from inside the app, not just web). IAP vs external-link entitlement for `BuyCourse`/`Subscription`.
   - Google Play: Data-safety form matches actual SDK usage (Push, Location if any, Camera, Storage). Target SDK current. Closed-testing track ready.
6. **Device verification** — matrix I'd run: iOS simulator + 1 real iPhone; Android emulator + 1 low-RAM real device (crash-shield stress).
7. **Capgo live updates** — currently *removed* per `capacitor.config.ts` comment ("paid SaaS, not used"). Skill recommends it; I will **not** re-add without your say-so.

---

### Deliverable of this walkthrough (after you approve)

I will produce **one markdown report** at `CAPACITOR_AUDIT.md` (file already exists — I'd append a dated section, not overwrite) containing:

- Crash-shield findings table: file:line → risk → severity → suggested fix.
- Web→Capacitor compliance table: skill step → status (pass / gap / N/A) → evidence.
- Store-submission risk list (Apple + Play).
- Prioritized fix backlog (P0 crash / P1 store-blocker / P2 polish).

No source files under `src/`, `android/`, or `capacitor.config.ts` will be modified in this pass. Any fixes get a separate approval.

---

### Confirm before I proceed

- OK to write the findings into `CAPACITOR_AUDIT.md` (append-only)? Or prefer chat-only?
- Any surface to skip (e.g. Admin pages) or focus first (e.g. Video + PDF where recent crashes were reported)?
