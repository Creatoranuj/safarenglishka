# Remaining Work Plan — P1/P2/P3 (Post 2026-07-16 Session)

## P1.A — `pdf-proxy` 401 retry-with-refresh
**File:** `src/hooks/useLocalPdfSource.ts` (+ new `src/test/pdfAuthRetry.test.ts`)

- Wrap the `pdf-proxy` fetch in a `fetchWithAuthRetry()` helper.
- On 401: call `supabase.auth.refreshSession()` once, retry with new access token.
- Guard with a module-level in-flight `refreshPromise` so parallel PDF opens share one refresh.
- If refresh fails or second attempt is still 401 → throw original error (classified as `Unauthorized` by `pdfErrors.ts`).
- Emit `pdfLog("retry", { reason: "401-refresh", ok })` breadcrumb for Sentry.
- Unit test: mock fetch → 401 → refresh → 200; assert single refresh even with 3 parallel callers.

Scope: ~40 LOC + ~60 LOC test. No behavior change on 2xx path.

## P1.B — Verify API 33 green with `androidWebViewHierarchy: devtools`
**Files:** `package.json` version bump, throwaway git tag.

1. Bump `version` → `1.0.30-smoke-devtools`.
2. Push tag `v1.0.30-smoke-devtools` → triggers `signed-apk-smoke.yml`.
3. Observe API 33 leg:
   - **Green** (`Flow completed successfully`, `attempts_used=1`, `smoke_exit=0`) → revert version, cut real `v1.0.30`.
   - **Red** → read logcat artifact; branch:
     - `driver-screenshot-null` still present → devtools bridge not up; add fallback (`-writable-system -selinux permissive` in emulator-options).
     - New failure class → capture in observer doc, do not promote.
4. Deliverable: `docs/observer/2026-07-16-signed-smoke-devtools-verification.md` with attempt count, timing, crash lines.

## P2.A — OOM regression guard
**File:** `src/test/nbDownload-memory.test.ts` (new)

- Static-analysis-style test: import download helper source, assert no `new Uint8Array(size)` allocation for `size > 50MB` without a chunked-stream branch.
- Prevents recurrence of the July 16 `nb-download` OOM class (see `docs/observer/2026-07-16-sentry-triage-oom-nbdownload.md`).

## P2.B — `size_bytes` mandatory on new DownloadRecord
**File:** `src/services/savedDownloads.ts`

- Change interface `size_bytes?: number` → `size_bytes: number` for **new** inserts (leave legacy rows nullable via a separate `LegacyDownloadRecord` union).
- Insert path rejects (dev-mode `console.error` + Sentry breadcrumb) if `size_bytes` missing — forces callers to compute size up-front so the chunked-vs-buffered decision is deterministic.

## P2.C — Promote API 28/35 to hard gates
**File:** `.github/workflows/signed-apk-smoke.yml`

- Gate: only after **3 consecutive green** P1.B-style runs on API 33.
- Flip `continue-on-error: true` → `false` on API 28 + API 35 legs.
- Keep 300s `extendedWaitUntil` timeout (documented API 28 x86_64 cold-paint budget).

## P3 — Deferred (documented, not built)
- **Play Integrity attestation** — server-side edge function scope, needs Play Console setup.
- **Flake-rate dashboard** — extends existing `flake-trend-aggregator.yml`; non-urgent.
- **Upstream Maestro `Bitmap` null-check** — file issue against `mobile-dev-inc/maestro`.

## Skill lenses applied to this plan
`senior-architect-audit` (verdict per item), `app-crash-shield` + `sentry-triage` (P1.A + P2.A target real crash classes), `perf-exam-ready` (no regressions to PDF cold-open budget), `supabase-architect-auditor` (401 retry uses standard SDK refresh, no custom RPC), `red-team-security-audit` (retry never leaks refreshed token to logs), `console-error-triage` (breadcrumb key stable), `capacitor-*` / `mobile-view` / `soft-touch` / `asset-optimization` — N/A this batch, no UI touched.

## Files changed
- `src/hooks/useLocalPdfSource.ts` (edit)
- `src/test/pdfAuthRetry.test.ts` (new)
- `src/test/nbDownload-memory.test.ts` (new)
- `src/services/savedDownloads.ts` (edit)
- `.github/workflows/signed-apk-smoke.yml` (edit — P2.C only after P1.B green ×3)
- `package.json` (temp bump for P1.B)
- `docs/observer/2026-07-16-signed-smoke-devtools-verification.md` (new, post-run)

## Not doing
- Any UI/design change (no surface in scope).
- P3 items — deferred per your priority.
- Touching `security.ts`, FLAG_SECURE, or `pdf-proxy` edge function itself.
