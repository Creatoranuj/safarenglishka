# Human Tone Audit — Phase 2 Ship Plan

Applied `human-tone-ui` checklist across the app (no edits yet). Below is the frog-eye audit, the ship plan, and the observer report deliverable. Nothing runs until you approve.

---

## A. Audit findings (no edits)

Counts from a live grep of `src/`:
- `Sparkles` used as decorative/mascot icon in **11 spots** across 8 files.
- `"Loading..."` bare string: **5** spots.
- `"Please wait"` filler: **6** spots.
- `"Something went wrong" / "Oops"`: **6** spots.
- Success toasts ending in `!` or `successfully!`: **72** spots.
- Filler marketing copy: `"Start Your Journey"` (Signup), `"Empowering Young Minds"` (Login), `"Empowering Futures"` (server title), `"Unlock everything Safar English has to offer"` (paywall), `"Please wait & Deep Breath"` (Dashboard loader).

### HIGH severity (breaks tone contract)

| # | Where | What's wrong | Human fix |
|---|---|---|---|
| H1 | `VideoSummarizer.tsx`, `LiveSarthiPanel.tsx`, `AskDoubtSheet.tsx`, `TopicsCovered.tsx`, `ObsidianNotes.tsx`, `SubscriptionPaywall.tsx`, `Landing/Footer.tsx`, `LiveClass.tsx` | `Sparkles` used as AI/agent mascot (11 sites) | Replace with domain icon: `Bot` (AI reply), `Wand2` (generate), `Clock` (timestamps), `BookOpen` (notes). Keep only where it means "AI-generated" and pair it with a real label. |
| H2 | `pages/Signup.tsx:42` | `"Account created! Welcome to Safar English!"` | `"Account ready — chalo shuru karte hain"` |
| H3 | `pages/Signup.tsx:173` | Hero: `"Start Your Journey"` | `"English aaj se, roz thoda"` |
| H4 | `pages/Login.tsx:164` | Hero: `"Empowering Young Minds"` | `"Roz ka English, tumhaari raftaar pe"` |
| H5 | `pages/Dashboard.tsx:247` | Loader text: `"Please wait & Deep Breath"` | Remove text; keep skeleton only. |
| H6 | `pages/ChapterView.tsx:175,187` | `text="Please wait..."` on full-page spinner | Switch to `ListCardSkeleton` (matches project rule). |
| H7 | `pages/NotFound.tsx:15` | `"Oops! Page not found"` | `"Yeh page nahi mila. Home pe wapas jao."` + `Go home` CTA. |
| H8 | `pages/BuyCourse.tsx:363` | `"Something went wrong after payment…"` | `"Payment safe hai — enrollment thodi der me automatic ho jayega. 2 min baad refresh karo."` |
| H9 | `pages/AdminLogin.tsx:68`, `pages/Login.tsx:86`, `pages/Settings.tsx:219` | `"Something went wrong"` fallbacks | `"Kuch ruk gaya — dobara try karo"` + log the real code via `logError`. |
| H10 | `useAdminEnrollment.ts:66` | `'🎉 Admin Access Granted!'` | `"Enrolled"` (past tense, no emoji). |
| H11 | `useLiveReminder.ts:53` | `"Reminder set! Class start hone pe notify karenge."` | `"Reminder set — class shuru hote hi ping karenge"` (drop `!`). |
| H12 | `server.ts:16` + `index.html` | Title `"Safar English - Empowering Futures"` | `"Safar English — Roz ka English practice"` (also fixes SEO filler). |

### MEDIUM severity (72 success toasts)

All success toasts across `useProfiles`, `useAttendance`, `useComments`, `useMaterials`, `useTimetable`, `useTestimonials`, `useStudentNotes`, `useLessons`, `useLessonPdfs`, `TopicsCovered`, `VideoSummarizer` follow the pattern `"X successfully!"` / `"X saved!"` / `"X deleted!"`.

Fix pattern (2-word past tense, no `!`, no emoji):
- `"Profile updated!"` → `"Profile updated"`
- `"Comment posted!"` → `"Comment posted"`
- `"Material uploaded successfully!"` → `"Material uploaded"`
- `"Lesson created successfully!"` → `"Lesson created"`
- `"Attendance marked!"` → `"Attendance marked"`
- `"Copied!"` → `"Copied"`
- `"Bulk attendance saved!"` → `"Attendance saved"`
- `"AI timestamps generated! Review and save."` → `"Timestamps ready — review and save"`

Error toasts get `[what broke] — [what to do]`:
- `"Failed to save note"` → `"Note save nahi hui — dobara try karo"`
- `"Failed to fetch lessons"` → `"Lessons load nahi hue — refresh karo"`
- `"Delete failed: <msg>"` → `"Delete nahi ho paaya — dobara try karo"` (log `msg` via `logError`).
- `"PDF upload failed: <msg>"` → `"PDF upload nahi hua — file check karke dobara try karo"`.

### LOW severity (polish)

- `pages/Students.tsx:122` `"Loading..."` → skeleton row of 6.
- `pages/AllLive.tsx:135` `"Loading..."` → skeleton.
- `pages/Admin.tsx:547` `"Loading..."` / `"Taking longer than expected..."` → skeleton + retry chip after 8s.
- `admin/ContentDrillDown.tsx:1083` `"Loading..."` → skeleton.
- `BuyCourse.tsx:422` `text="Loading course…"` → already Hinglish-ish; leave.
- `pages/PaymentCallback.tsx:92` `"Please wait while we confirm your payment..."` → `"Payment confirm ho raha hai — page band mat karo"`.
- `SubscriptionPaywall.tsx:103` `"Unlock everything Safar English has to offer"` → `"Poora Safar English — ek subscription me"`.
- `LessonView.tsx:1850` `"Unlock instant access to all N lessons"` → `"Poore course ki saari N lessons ek saath"`.
- `useAutoScroll.ts:123` `"Autoscroll works only on in-app PDFs..."` → `"Autoscroll sirf in-app PDFs pe chalta hai. Pehle My Library me save karo."`

### Signal-only (nothing to do)

- `Unlock` icon from `lucide-react` in admin surfaces — icon name, not copy.
- `useLiveReminder` already uses good Hinglish (`"Pehle login karo"`, `"Reminder hata diya"`). Keep as reference tone.
- `useTestimonials` uses `"Saved."`, `"Deleted."` — already close to ideal, just drop the period.

---

## B. Phase 2 ship plan (build mode, after approval)

Execute in one turn. All frontend/copy only, no schema or logic changes.

### Step 1 — Toast copy sweep (highest impact)

Retrofit all 72 success toasts + ~40 error toasts across the hook files above to the pass/fail patterns in the audit. New helper `src/lib/toast.ts` exposes:

```ts
notify.saved(entity)     // "Note saved"
notify.deleted(entity)   // "Note deleted"
notify.updated(entity)   // "Profile updated"
notify.failed(action, e) // "Note save nahi hui — dobara try karo" + logError
```

Migrate hooks to the helper so future hooks stay consistent.

### Step 2 — Sparkles purge

Replace 11 `Sparkles` usages:
- Ask Doubt / Sarthi / LiveSarthiPanel → `Bot`
- VideoSummarizer / Video generate → `Wand2`
- TopicsCovered / timestamps → `Clock`
- ObsidianNotes → `NotebookPen`
- SubscriptionPaywall → `Crown`
- Landing Footer tagline → drop icon, keep text only.

Remove `Sparkles` imports where no longer used.

### Step 3 — Loader + empty state fixes (H5, H6, LOW)

- Dashboard loader: skeleton only, no `"Please wait & Deep Breath"`.
- ChapterView: switch to `ListCardSkeleton`.
- Students / AllLive / Admin / ContentDrillDown: skeleton rows instead of `"Loading..."`.
- Admin 8s stall → append `Retry` chip.

### Step 4 — Hero + auth copy (H2–H4, H10, H12)

- Signup hero + toast → new copy.
- Login hero → new copy.
- Admin enroll toast → `"Enrolled"`.
- Fix `<title>` in `index.html` and `src/server.ts` (title + og:title + twitter:title).

### Step 5 — Error copy (H7–H9, LOW)

- `NotFound`, `Login`, `AdminLogin`, `Settings`, `BuyCourse`, `PaymentCallback` — apply `[what broke] — [what to do]` pattern; log the raw code via `logError`.
- `SubscriptionPaywall`, `LessonView` paywall lines — swap filler CTA text.

### Step 6 — Guardrail script (regression fence)

Add `scripts/guard-tone.mjs` (invoked by existing `bun run guard:all`) that fails CI when:
- New `Sparkles` import appears outside a whitelist (empty by default).
- `"Loading..."`, `"Please wait"`, `"Something went wrong"`, `"Oops"`, `"successfully!"`, `"Awesome"`, `"Amazing"` show up in `src/**/*.{ts,tsx}`.
- Success toast strings end with `!`.

Ceilings shrink to 0 after Step 1–5 land.

### Step 7 — Verify

- `bun run guard:all` (must pass).
- `tsgo` typecheck.
- Playwright smoke on Signup, Login, Dashboard, LessonView, BuyCourse to screenshot the changed copy.

---

## C. Observer report deliverable

Also (as part of Step 7) write `docs/observer/2026-07-20-human-tone-phase2.md` with:

- **Window observed:** this session (audit + Phase 2 ship).
- **Incomplete → Fixed:** every HIGH row above with before/after evidence.
- **Follow-ups deferred:** any strings the user rejects during review, plus the two `Loading course…` / `Loading...` sites that need broader skeleton refactor (tracked, not shipped this turn).
- **Linked to current work:** connects to earlier `lovable-design-language` popup unification and `perf-caching` avatar cache — those changes' copy is re-audited here.
- **Risks:** dropping `!` and emoji may feel "cold" to some admins — mitigated by keeping haptics + toast tint variants.
- Append one line to `docs/observer/INDEX.md`.

---

## Technical details

- No DB migration, no edge-function change, no dependency add.
- Files touched: ~28 (hooks, 6 pages, 8 components, `index.html`, `server.ts`, new `src/lib/toast.ts`, new `scripts/guard-tone.mjs`).
- New guard script wired into existing `.github/workflows/code-guards.yml` via `bun run guard:all`.
- Backward compat: `notify.*` helpers are additive; old direct `toast.success(...)` calls keep working during migration.
- Estimated diff: ~600 lines changed, ~140 added.

---

## Open decisions (answer inline or say "sensible defaults")

1. **Hero copy tone** — Hinglish (my draft above) or pure English? Default: Hinglish to match the app's dominant register.
2. **Emoji policy** — kill all emojis in toasts (my recommendation) or keep 🙏 in AI-retry messages? Default: kill all except 🙏 on Ask-Doubt retry.
3. **Guard script strictness** — hard-fail on new `Sparkles` imports app-wide, or whitelist Landing/Marketing only? Default: hard-fail everywhere, whitelist empty.
4. **Toast helper adoption** — migrate all 72 sites this turn (bigger diff) or only the top 20 highest-traffic hooks and leave the rest to organic migration? Default: migrate all 72 this turn — one-time pain, permanent fence.

Say **"ship phase 2"** with sensible defaults, or answer 1–4 to override.
