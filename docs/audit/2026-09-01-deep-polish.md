# Deep polish audit — 2026-09-01

Rating: **4 / 5** — solid, well-tested app with real budget enforcement; the
open items are size/structure debt and two token-scoping decisions, not
correctness bugs.

Scope note: this pass ran with **no workspace skills installed**, so every
finding below is first-hand analysis of the repository at
`Creatoranuj/safarenglishka@main`, not skill-driven checklists.

## Applied this pass (verified: typecheck clean, build clean, 259 tests pass)

### HIGH — landscape PDF header left a strip at the top
`src/components/library/DocReaderShell.tsx`. Two independent causes:

1. The opaque notch band (`data-testid="reader-notch-band"`) was rendered
   unconditionally and deliberately **outside** the rotation frame. In
   landscape the safe-area inset runs along the *side*, so the band stayed
   painted as a horizontal strip across the physical top — exactly the reported
   sliver. It now renders only when `headerVisible && !landscape &&
   !pseudoLandscape`.
2. The hidden header used `-translate-y-full`. A percentage translate resolves
   against the element's own box, and inside the rotated, `backdrop-blur`ed
   frame Android WebViews rounded it down enough to leave a hairline of the
   bar's safe-area padding. It now translates by
   `-(headerHeight + 8px) - env(safe-area-inset-top)` and keeps
   `opacity-0 invisible`.

Guard: `src/test/docReaderShell-landscape-header.test.ts` (source-level on
purpose — the bug needs a real inset plus a rotated frame, neither of which
jsdom models).

### CRITICAL — committed anon JWT
`supabase/functions/security-regression/policies_test.ts` shipped a project URL
and an anon JWT as fallback defaults (and for a *different* project than the app
uses). Both removed; the test now requires `SUPABASE_URL` plus a key from the
environment and throws otherwise.
**Action for you: rotate that anon key**, since it is in git history.

### HIGH — chatbot rate limiter failed open
`supabase/functions/chatbot/index.ts` returned `false` (allow) when the counter
read/write threw, so a database hiccup removed the limit entirely on a path that
spends model credits. Now fails closed.

### MEDIUM — SSRF via third-party instance list
`supabase/functions/get-video-stream/index.ts` fetches a public Piped instance
list and used every `api_url` origin it returned. A poisoned entry could aim
server-side fetches at `localhost` or a metadata endpoint. Discovered origins
now pass `isSafeInstanceOrigin`: https only, no credentials in the URL, no IP
literals, no `localhost`/`.local`/`.internal`/`metadata.google.internal`,
dotted host required. The existing stream-URL allowlist was already correct and
was left alone.

Guard: `src/test/edge-security-guards.test.ts`.

## Bird's-eye

- **Route/data layer** — consistent Query-based loading, budgets enforced in CI
  by the `bundle-size` step (initial entry 118.5KB against a 180KB budget,
  vendor 724.5KB against 1000KB). This is the healthiest part of the codebase.
- **God components** — `LessonView` (~2870 lines), the video player (~1739),
  `DocReaderShell`/reader (~1601). Every reader/player bug this month landed in
  one of these three files. Splitting them is the highest-leverage structural
  work left, and it is deferred deliberately: it is a wide refactor that wants
  its own pass with the reader/player tests as the safety net.
- **Secrets hygiene** — after this pass, no JWT-shaped literals remain in
  `supabase/functions`. Repo-level secret scanning and push protection are
  enabled on GitHub.

## Frog-eye

- Crash-shield install is idempotent (`src/lib/crashShield.ts` guards a second
  install); the `itemPriority` listener flagged earlier is a module singleton by
  design, not a leak.
- Bundle numbers above are the current baseline; compare future changes against
  them rather than against impressions.

## Deferred, with reasons

| Item | Why not now |
| --- | --- |
| Split LessonView / player / reader | Wide refactor; needs its own pass and a green reader/player suite per step |
| Shorten signed-URL TTLs | Requires client-side auto-refresh first, or playback breaks mid-video |
| `pdf-proxy?token=` → scoped resource token | Protocol change across client and function; needs a migration window |
| Design-token drift on Admin / PlayerControls | Cosmetic; batch with the next design pass |
| 44px + aria sweep on player controls | Needs device measurement, not source inspection |
| Supabase RLS / index / slow-query snapshot | The connected project and the project the app client points at differ — see below |

## Still blocked on you

**Two different Supabase projects.** `src/integrations/supabase/client.ts` and
`.env` point at `wegamscqtvqhxowlskfm`; the project connected in Lovable is
`cmbattmjwriiesibayfk`. Any RLS/index/slow-query report would describe a
database the app does not use, so that section is intentionally absent. Tell me
which one is real: if it is `wegamscqtvqhxowlskfm`, I re-run the backend audit
against it with no code change; if it is `cmbattmjwriiesibayfk`, the client
keys, `.env`, `supabase/config.toml` and generated types all have to be
repointed and the schema reconciled first.
