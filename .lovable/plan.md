## Scope
Fix 5 things surfaced this turn, all with the senior-architect-audit + github-skill-importer lenses.

---

### 1. Chatbot greeting spam ("Namaste! Main Safar AI Agent hoon…" har reply me)
**Where:** `supabase/functions/chatbot/index.ts` — system prompt (line 329–360) currently mandates the identity line as a rule, so the model prepends it to nearly every response.

**Fix:**
- Rewrite IDENTITY RULE #2: the greeting fires **only** when the user's message is literally an identity question (who are you / kaun ho / what is your name / tumhara naam). Every other reply must go straight to the answer with **no greeting, no self-introduction, no "Namaste"**.
- Add explicit "DO NOT" block: never start replies with "Namaste", "Hello", "Hi", "Main Safar AI Agent hoon", or any self-introduction unless the identity question above matches.
- Add a server-side post-processing guard: strip a leading greeting sentence if the previous assistant message in the same conversation already introduced the bot (belt-and-braces against a stubborn model).
- Keep welcome message (`WELCOME_MSG` in `ChatWidget.tsx`) as the single first-turn greeting — no change.

### 2. "Find Agents delete" — legacy agent cleanup
- Confirmed `lovable/agents/` folder does not exist.
- Sweep for residual references: `@lovable/agent-sdk`, `@lovable/agents-sdk` in `package.json`, `useLessonChat.ts` ASK_TEACHERS list ("Safar Agent" etc.), and any dead edge-function agent registrations. Remove unused imports + package entries. Keep the active chatbot edge function (that is not the legacy runtime).

### 3. Quiz surface — senior-architect-audit
Audit target: `src/pages/QuizAttempt.tsx`, `QuizResult.tsx`, `components/quiz/*`, `supabase/functions/score-quiz/index.ts`.

Deliverable: report in the standard senior-architect-audit format with a 1–5 rating and Findings across all 12 lenses (SEC/AUTHZ/DATA/PERF/RELY/UX/A11Y/OBS/MAINT/CONFIG/VIS/MOT). Known suspects to verify:
- localStorage answer draft (`quiz_answers_${user.id}_${quizId}`) — XSS-stealable, no versioning on question set change.
- Full-page spinner ("Loading quiz…") instead of skeleton matching final layout (VIS/UX).
- `useCallback` deps for auto-submit on timer end (RELY).
- Section labels derived by heuristic — potential wrong-marks (DATA).
- Palette tap targets, ARIA on flag button (A11Y).
Apply LOW fixes inline; surface HIGH/CRITICAL for approval.

### 4. PDF fix
The user uploaded `downloadfile_1.pdf` but did not specify the exact PDF glitch to fix. I will:
- Parse the uploaded PDF to see if it is a bug repro (a broken lesson PDF) or reference material.
- Run a senior-architect pass over `src/components/video/PdfViewer.tsx`, `capacitor-plugin-nb-pdf`, and `pdf-proxy` edge function for the common breakage classes: signed-URL race, token expiry not retried, `<embed>` fallback missing on Android WebView, cleanup on unmount.

**Blocker:** I need to know what specifically is broken about the PDF before writing fixes. (See open question below.)

### 5. `.github/workflows/lighthouse-ci.yml` fix
Findings on the current file:
- `actions/upload-artifact@v6` and `actions/cache@v5` don't exist yet — latest are v4. This silently fails the workflow.
- No `LHCI_GITHUB_APP_TOKEN` → status check never posts back.
- Missing `pull-requests: write` + `checks: write` permissions block.
- Report path `.lighthouseci/` is fine but `if-no-files-found: ignore` masks real config failures — change to `warn`.

Fix: pin to v4 actions, add permissions block, tighten `if-no-files-found`, and add a preview-server wait step so Lighthouse doesn't race the build.

### 6. github-skill-importer — on-the-spot
Clone `Cap-go/capgo-skills` → `/tmp`, diff against `.agents/skills/`, and import any missing items from the curation matrix relevant to this stack. Expected to be a no-op (curation matrix was already fully imported in a prior turn) — will report the diff either way and apply drafts if anything is missing.

---

## Order of execution
1. Chatbot greeting fix + post-process guard (Now).
2. Legacy agent sweep (Now).
3. Lighthouse workflow fix (Now).
4. Skill importer diff + apply (Now).
5. Quiz audit report + LOW fixes applied inline; HIGH surfaced (Now).
6. PDF fix — deferred until user answers the open question.

## Open question
**What exactly is broken about the PDF?** Options:
- (a) The uploaded PDF fails to open in the app — I'll debug `PdfViewer.tsx` + proxy.
- (b) The PDF renders but is glitchy (blank pages / no zoom / crash on scroll).
- (c) The PDF is just reference material (spec/design) — tell me what to build from it.

I'll parse the PDF regardless to see if the answer is obvious.

## Rules followed
No HIGH/CRITICAL edits without approval; LOW applied inline. Anti-patterns from the audit checklist (roles-on-profiles, RLS-without-GRANT, `any`-casted Supabase, key={index}, cleartext:true, splash-without-JS-timeout, sticky hover on Android) will be flagged per surface.
