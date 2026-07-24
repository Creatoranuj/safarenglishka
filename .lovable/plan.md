# Plan: Fix `signed-apk-smoke` exit-1 + E2E audit (with local test env)

Skills: **capacitor-ci-cd** + **ci-e2e-error-monitor**

## Problem

`Signed APK Smoke` workflow fails with `Process completed with exit code 1`. The workflow is 1173 lines, matrix-based (API 33 hard-gate, API 28/35 advisory), and shells out to Maestro on an emulator. Exit 1 could be raised at ~14 distinct steps — I will not guess; I will localize the exact step first.

**Blocker**: I cannot see the failing run log from here. I need either the run URL / raw log, or permission to inspect via `gh run view`.

## Step 1 — Confirm which step raised exit 1 (read-only)

Match against the `ci-e2e-error-monitor` signature table (S1–S10). Likely culprits by frequency:

| Suspect step | Signature | Why plausible |
|---|---|---|
| `Build signed release APK` (gradle) | non-signature — keystore secret missing/decoded wrong | Exit 1 from gradle, not the runner |
| `Install Maestro (pinned)` | S1 variant — `set -eo pipefail` under bash (line 192) is OK; but curl → bash pipe can 127 | Already emits telemetry then exits |
| `Run smoke` (Maestro test) | S3 (empty MAESTRO_EMAIL/PASSWORD) or S9 (assertion timeout) | Most common on tag pushes |
| `Locate APK` inside `/tmp/smoke.sh` | `No release APK found` → exit 1 | Only if gradle output path drifted |
| `smoke.yaml` first-paint | login → dashboard assertion timeout | S3 root cause |

I will pull `gh run view --log-failed` for the last failed run of this workflow and grep for `##[error]` + the last non-benign line before `Terminate Emulator`.

## Step 2 — Stand up a local repro environment (before any edit)

Sandbox already has: bun, node, java? Let me check and fill gaps. Goal: reproduce the failing step without waiting on GitHub Actions.

- **YAML lint** — `python3 -c "import yaml; yaml.safe_load(open(...))"` on all 11 workflows.
- **Shell lint** — extract each `run:` block and pipe through `shellcheck` (via `nix run nixpkgs#shellcheck`) to catch dash/bash issues, unquoted `$VAR`, missing `set -e`, and pipefail-in-dash (S1/S10).
- **Gradle dry-run** — `./gradlew assembleRelease --dry-run` with a stub keystore to prove the signed-build step's flag order is valid without needing real secrets.
- **Maestro flow parse** — `maestro test --dry-run maestro/smoke.yaml` (install maestro CLI in sandbox) to catch flow-syntax errors and unresolved `${MAESTRO_EMAIL}` refs.
- **`act` (nektos/act)** — run the workflow locally in Docker for the non-emulator jobs (`plan-smoke-matrix`, build steps up to gradle) to catch env/shell issues in CI-like conditions. Emulator step cannot run under `act` (no KVM in Docker-in-Docker), so it stays as a live-run test.

All checks output to `/tmp/e2e-audit/` — nothing committed until Step 3.

## Step 3 — Fix the confirmed root cause + adjacent regressions

Apply exactly one fix per confirmed signature. Re-validate with Step 2 tools before push. No speculative edits.

## Step 4 — End-to-end audit of the other 10 workflows

For each of `build-apk.yml`, `code-guards.yml`, `dependency-audit.yml`, `enrollment-bypass.yml`, `flake-trend-aggregator.yml`, `lighthouse-ci.yml`, `maestro-android.yml`, `pdf-proxy-keepalive.yml`, `playwright-e2e.yml`, `supabase-keepalive.yml`: run the same YAML + shellcheck + signature match. Produce `docs/audit/2026-07-23-workflow-e2e.md` with rows: `workflow · risk · signature · exact-fix`.

## What I need from you before I start

Pick one:
- **A** — Paste the failing run URL (or the last 50 lines of the failing step log). Fastest path.
- **B** — Skip the log; I install the local repro tooling first, then re-run the workflow via `workflow_dispatch` to capture a fresh failure and diagnose from there.

Also confirm the four required secrets exist and are non-empty in repo settings: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, plus `MAESTRO_EMAIL`, `MAESTRO_PASSWORD`. If any is unset, the workflow fails at exactly line 158 or 248 with the observed exit 1.

## Non-goals

- No changes to app code (`src/**`, `supabase/**`).
- No re-enabling `push.tags` auto-trigger (constraint honored).
- No blind bulk edit across workflows — one root cause per fix.
