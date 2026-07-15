## Verification — deep-fix in `.github/workflows/signed-apk-smoke.yml`

All six items from the deep-fix plan are present in the workflow. No further code edits required — the next signal comes from an actual CI run.

### What I checked (grep against the workflow)

| Fix | Evidence in file |
|---|---|
| 1. Bad `cli-2.6.1` pin removed | L90 `maestro-version: "2.6.1"` (bare version); L88-89 comment documents why `cli-` prefix was wrong |
| 1b. Installer post-guard | L203 install-fail check → `::error::Maestro install failed`; L210 binary-missing check |
| 2. Reclassify `exit 143` | L363 `124|137|143) FAILURE_CLASS="driver-timeout-terminated"` |
| 3. Retry driver reset | L243 `apply_api35_mitigations()` defined; L287 pre-flow; L357 pre-retry re-apply |
| 4. Launch sanity check | L295 `LAUNCH_SANITY_OK=1`; L301 `=0`; L320-322 → `app-launch-failed` classification |
| 5. Rollup gate matches matrix | L68 `continue-on-error: ${{ !(matrix.api-level == 33 && matrix.maestro-version == '1.39.0') }}` — only API33+1.39.0 hard, everything else advisory (matches stated rule) |
| 6. Telemetry carries class | L183 install-phase JSON; L467-470 final JSON includes `failure_class` + `maestro_version` |

### Not yet verified (needs a real CI run — cannot verify from source)

- API 35 `2.6.1` leg actually installs (proves the `cli-` prefix fix works on the live installer endpoint).
- API 35 `1.39.0` retry no longer inherits dead driver (proves `apply_api35_mitigations` between attempts helps).
- New `failure_class` values (`driver-timeout-terminated`, `app-launch-failed`, `maestro-install-failed`) actually appear in the rollup summary.
- API 33 + `1.39.0` remains the only hard-fail leg (rollup drift fix holds under real matrix expansion).

### Recommended next step

Trigger `signed-apk-smoke.yml` via `workflow_dispatch` once. Then pull:
- `signed-apk-smoke-report-api35-maestro2.6.1` — confirms install fix
- `signed-apk-smoke-report-api35-maestro1.39.0` — confirms retry reset helps
- Job summary table — confirms `failure_class` column populated

If all three API 35 legs still fail but with **distinct, correctly-labeled** failure classes, the fix succeeded (diagnosability was the goal; API 35 green was never promised in this pass).

### Nothing to build in this plan

This plan is verification-only. Approve to trigger the CI run + artifact triage as the next action. If you want me to also (a) add a `workflow_dispatch` input for a single-leg debug run or (b) add a `jq` snippet that pretty-prints `failure_class` counts in the summary, say so and I'll fold it into a build-mode plan.
