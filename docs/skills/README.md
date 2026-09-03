# Saved skills — Safar English

Skills live in the Lovable workspace, and a workspace move wipes them. This
folder is the repo-side copy so they survive: the rules are versioned with the
code they govern, and a fresh session can be re-taught from here.

Two kinds of entries:

- **Full body** — project-specific skills written for this codebase. Restore by
  pasting the file back into a workspace skill.
- **Index only** — generic Capacitor/Capgo playbooks that are public docs; the
  link is enough.

## Machine-enforced (this is the important column)

Every row below is no longer "remember to check this". It runs on every PR via
`.github/workflows/skill-guards.yml` → `scripts/guards/`.

| Skill | Guard id | Mode | Saved |
| --- | --- | --- | --- |
| app-crash-shield | `crash-cleanup`, `empty-catch` | block + warn | full body |
| asset-optimization | `asset-size` | block | full body |
| capacitor-back-button | `back-button` | block | full body |
| capacitor-video-player-master | `player-chrome` | warn | body not in repo yet |
| console-error-triage | `console-error` | block | full body |
| mobile-view-expert | `mobile-view` | warn | full body |
| senior-architect-audit | `arch-polish` | warn | full body |
| soft-touch | `soft-touch` | warn | full body |
| supabase-architect-auditor | `supabase-rls` | block | full body |
| red-team-security-audit | `secrets-and-webview` | block | full body |
| perf-exam-ready | `perf-budget` | block | full body |
| sentry-triage | `sentry-context` | warn | body not in repo yet |
| capacitor-bun-apk-build | (build-apk.yml) | block | full body |
| razorpay-payments | (razorpay-smoke.yml) | block | full body |

## Index only (public Capgo/Capacitor docs)

capacitor-best-practices, capacitor-deep-linking, capacitor-keyboard,
capacitor-offline-first, capacitor-performance, capacitor-plugins,
capacitor-security, capacitor-splash-screen, capacitor-testing,
debugging-capacitor, ionic-design, ios-android-logs, safe-area-handling,
tailwind-capacitor, webapp-to-capacitor, framework-to-capacitor,
capacitor-ci-cd — see https://capgo.app/docs and https://capacitorjs.com/docs.

## Running the guards locally

```bash
bun run guard:skills            # everything
bun run guard:skills:block      # only the blocking set
bun run guard:skills:snapshot   # current counts, never fails
```

Budgets are in `scripts/guards/guards.mjs`. After a cleanup PR, lower the
number — never raise it.
