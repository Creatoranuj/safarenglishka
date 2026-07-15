# History-Observer Sweep — Loose Ends from Last Session

Read-only audit of turns #29-#41 (Books-fix → auto-clicker crash → Supabase connect → signed-smoke API 28/35 → do A). Deliverable is a scannable markdown report; no code edits.

## Actions
1. Cross-check repo against chat claims (parallel `rg`/reads):
   - `.github/workflows/signed-apk-smoke.yml` → confirm matrix `[28, 33, 35]` + `continue-on-error` on both 28/35, only 33 hard-gates.
   - `src/services/personalLibrary.ts` → confirm `singleFlight` wraps all 8 mutation entry-points (reorder/rename/move/delete × item/folder).
   - `src/services/savedDownloads.ts` + `src/hooks/useDownloads*` → verify the deferred single-flight guard is NOT yet applied (Next-item from turn #32).
   - `src/components/books/BookCard.tsx` + `src/index.css` + `tailwind.config.ts` → confirm `--brand-accent-foreground` token + `[@media(hover:hover)]:` wrappers landed.
   - `supabase/config.toml` + `src/integrations/supabase/client.ts` → confirm project connected; note RLS-review is still pending (turn #34).
   - Grep for anti-patterns surfaced in the user's prompt across surfaces touched this session: `key={index}`, `webContentsDebuggingEnabled: true`, `cleartext: true`, `localStorage.*token`, `as any` on supabase, static `@capacitor/*` imports without web fallback.

2. Classify each finding: INCOMPLETE / FOLLOW-UP / LINKED / DROPPED / RISK.

3. Write `docs/observer/2026-07-15-post-do-a-loose-ends.md` in the mandatory observer format (Incomplete / Follow-ups / Linked / Dropped / Risks / Signal-only / Visibility notes) — quoting chat evidence with turn numbers and file:line proof.

4. Append one line to `docs/observer/INDEX.md`.

## Expected findings (pre-verify)
- **FOLLOW-UP** — `savedDownloads` / `useDownloads` single-flight guard (turn #32 "Next, LOW").
- **FOLLOW-UP** — RLS policy review after Supabase connect (turn #34).
- **FOLLOW-UP** — Push next tag to observe API 28 advisory leg on a real run (turn #40).
- **FOLLOW-UP** — SHA-pin `android-emulator-runner` + `setup-bun` post next green tag (turn #38 Root).
- **RISK** — API 28 hard-gate deferred to self-hosted KVM+GPU runner (turn #36/#38).
- **RISK** — Reorder-button debounce in `FolderView`/`FolderGrid` not applied — service-layer coalesces to 1 action even when user wants 3 (turn #32 Root, needs UX call).
- **LINKED** — Books-page `text-black` → `--brand-accent-foreground` migration hint (turn #30 Root): grep other `text-black`/`text-white` on brand-accent surfaces.
- **DROPPED / SIGNAL** — 12-skill tag list from turn #35 largely acknowledged only via `senior-architect-audit` + `ci-e2e-error-monitor`; the rest (asset-optimization, capacitor-back-button, sentry-triage, red-team-security-audit, perf-exam-ready, mobile-view-expert, soft-touch, capacitor-video-player-master, console-error-triage, supabase-architect-auditor) were not individually run this session.

## Rules honored
- Read-only. No edits to source, migrations, or workflows.
- Only writes: `docs/observer/2026-07-15-*.md` + one line in `docs/observer/INDEX.md`.
- Quote-not-paraphrase for INCOMPLETE/DROPPED items.
- No re-proposing rejected ideas (self-hosted runner spend stays RISK, not a fresh recommendation).

## Deliverable
Single new file `docs/observer/2026-07-15-post-do-a-loose-ends.md` + INDEX line. Closing reply points user to the report path.
