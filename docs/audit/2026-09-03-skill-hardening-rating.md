# Skill hardening in CI + app rating — 2026-09-03

## What changed

The twelve review skills were, until today, things a human re-read and re-applied
by hand on every PR. That works right up until the day it doesn't. Each one now
has a machine check with a budget, wired into a dedicated workflow.

- `scripts/guards/lib.mjs` — shared ripgrep/budget helpers.
- `scripts/guards/guards.mjs` — 13 guards across 12 skills, each with a budget and a one-line reason.
- `scripts/guards/run.mjs` — runner (`--mode block|warn`, `--snapshot`), writes a GitHub job summary table.
- `.github/workflows/skill-guards.yml` — blocking job (fails PRs) + advisory job (`continue-on-error`).
- `package.json` — `guard:skills*` scripts; `guard:all` now includes them.
- `docs/skills/` — the skill playbooks saved into the repo so a workspace reset stops erasing them.

`build-apk.yml` was deliberately not touched. Maestro stays parked.

## Guard snapshot (today's baseline)

| Guard | Skill | Mode | Count | Budget |
| --- | --- | --- | ---: | ---: |
| `crash-cleanup` | app-crash-shield | block | 13 | 13 |
| `empty-catch` | app-crash-shield | warn | 42 | 42 |
| `asset-size` | asset-optimization | block | 0 | 0 |
| `back-button` | capacitor-back-button | block | 1 | 1 |
| `player-chrome` | capacitor-video-player-master | warn | 2 | 2 |
| `console-error` | console-error-triage | block | 8 | 8 |
| `mobile-view` | mobile-view-expert | warn | 2 | 2 |
| `arch-polish` | senior-architect-audit | warn | 51 | 51 |
| `soft-touch` | soft-touch | warn | 0 | 0 |
| `supabase-rls` | supabase-architect-auditor | block | 0 | 0 |
| `secrets-and-webview` | red-team-security-audit | block | 0 | 0 |
| `perf-budget` | perf-exam-ready | block | 0 | 0 |
| `sentry-context` | sentry-triage | warn | 229 | 229 |

Budgets are today's real counts, not aspirations. They ratchet **down** only —
a cleanup PR lowers the number, nothing raises it silently.

Two deliberate calibrations, both documented in the guard source:

- **Supabase migrations before `20260903` are excluded.** 54 historical files
  cannot be retro-edited; the guard holds the line from today forward instead of
  reporting a permanent red 54.
- **The Supabase anon key is not a leak.** The secrets guard decodes the JWT and
  only flags a non-`anon` role, so the publishable key in client code passes
  while a service-role key would fail.

## Verification

```
bunx tsc --noEmit              clean
bunx vitest run                38 files passed, 1 skipped · 293 passed, 4 skipped
bun run build                  entry 118.0 KB / 180 KB · vendor 724.6 KB / 1000 KB
node scripts/guards/run.mjs    13/13 within budget
```

## App rating

| Area | Rating | Reasoning |
| --- | --- | --- |
| Security | **8.5 / 10** | No privileged key in the client, HMAC verification centralized, admin RPCs revoked from `anon`/PUBLIC, `phone_otps` restricted to `service_role`. Held back by 6 open dependency-audit findings that need upstream upgrades. |
| Crash resilience | **8 / 10** | Error boundaries, `lazyWithRetry`, global handlers, single back-button owner. 13 files still open more listeners/timers than they clean. |
| Performance | **8.5 / 10** | Entry at 66% of budget, dashboard panels lazy behind skeletons, heavy PDF/player split out. Real low-end device numbers still come from an APK, not devtools. |
| Backend / data model | **8 / 10** | RLS + GRANT discipline enforced going forward; `user_roles` + `has_role()` is correct. Legacy migrations are unaudited history. |
| Mobile UX | **8 / 10** | Safe areas, 44 px targets, native back semantics, haptics wrapper. Two advisory findings outstanding. |
| Code health | **7.5 / 10** | 293 tests, typed boundaries, guards now enforced. 51 design-system drifts and 42 empty catches are real debt. |
| Observability | **6.5 / 10** | Sentry wired and console noise capped, but 229 `reportError` calls lack a `surface` tag, so issues are hard to route. Biggest single lever. |
| CI / release | **8.5 / 10** | Typecheck, tests, bundle budget, Capacitor parity, and now skill guards all gate PRs; APK builds reproducibly. E2E on emulator remains unsolved (renderer-level, not a product bug). |

**Overall: 8 / 10** — a genuinely well-defended app for its stage. The ceiling is
set by observability debt and the emulator E2E gap, not by the product code.

### Where the next point comes from, in order

1. Tag `surface` on `reportError` calls — do it in slices and ratchet the 229 down. Cheapest, largest payoff.
2. Clean the 13 listener/timer imbalances; that is the low-RAM Android failure class.
3. Upgrade the 6 dependency findings when upstream allows.
4. Move E2E to a real device; more emulator flags have stopped paying.
