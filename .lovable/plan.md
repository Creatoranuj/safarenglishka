
## Naya Finding (logcat + telemetry se)

Sirf "1.39.0 API 35 fail hua" wali kahani adhoori thi. Zips khol ke telemetry cross-check karne se ek **regression** mila jo main last edit mein khud le aaya:

### Cross-run comparison (v1.0.27 vs v1.0.28-smoke)

| Leg | v1.0.27 (before UID fix) | v1.0.28-smoke (after UID fix) |
|---|---|---|
| API 35 · 1.40.3 | attempt1 **PASS** (116s) | attempt1 **FAIL**, retry pass (302s) |
| API 35 · 2.6.1 | — | attempt1 **FAIL**, retry pass (300s) |
| API 35 · 1.39.0 | attempt1 fail → SIGTERM | attempt1 fail → SIGTERM (unchanged) |

Logcat evidence:
- **1.40.3 (failed leg)**: package `dev.mobile.maestro` `PACKAGE_FULLY_REMOVED` at 05:52:38 → `NEW_INSTALL` at 05:52:45 (retry ka reinstall — kaam kiya).
- **2.6.1 (failed leg)**: same pattern — retry reinstall se package aaya.
- **1.39.0 (failed leg)**: `PACKAGE_FULLY_REMOVED` mila but **koi NEW_INSTALL nahi** — 1.39.0 CLI retry par bhi driver reinstall nahi kar paya.

### Root cause (updated)

`apply_api35_mitigations()` mein maine jo `pm install-existing --user 0 dev.mobile.maestro` + `cmd package set-installer ...` **maestro test se PEHLE** call kiya — us waqt package install hi nahi hai. Result:
- Har API 35 leg par 2 loud Java stack traces (`Unknown package`, `Cannot set standby bucket`, `Unknown target package`).
- Wo shell exceptions ka side-effect: 1.40.3 ka attempt-1 jo pehle green tha ab consistently fail hota hai (device state pollute + timing shift).
- 1.39.0 pehle bhi broken tha, ab bhi broken hai — meri fix ne isko theek nahi kiya, sirf 1.40.3 ko todha.

### Do problems, do fixes

**Problem 1: Meri `apply_api35_mitigations` regression**
Pre-install phase mein wo 3 commands (`install-existing`, `set-installer`, `dumpsys`) chalna hi nahi chahiye — package exist hi nahi karta us waqt. Sirf **retry branch** mein (jab pehli `maestro test` ne driver install kar diya hai) meaningful hain.

**Problem 2: 1.39.0 × API 35 fundamentally broken**
2 consecutive tagged runs (v1.0.27, v1.0.28-smoke) mein retry ke baad bhi 1.39.0 driver reinstall nahi kar pa raha. A/B ka maksood pura hua — 1.40.3 aur 2.6.1 dono API 35 par green pin hain.

## Plan

### 1. `.github/workflows/signed-apk-smoke.yml` — matrix cleanup
Remove the broken cell:
```yaml
- api-level: 35
  maestro-version: "1.39.0"   # ← delete this entry
```
Retain 4 legs: API 28·1.39.0, API 33·1.39.0 (hard-gate), API 35·1.40.3, API 35·2.6.1.

### 2. Same file — `apply_api35_mitigations()` cleanup
Move `pm install-existing --user 0 dev.mobile.maestro` + `cmd package set-installer …` + `dumpsys` block **out** of the pre-install call site (~L287). Keep them ONLY in the **pre-retry** call site (~L357) where `dev.mobile.maestro` actually exists on device. That kills the two Java stack traces polluting attempt-1 on every API 35 leg.

Expected impact:
- API 35 · 1.40.3: attempt-1 pass restored (116s vs 302s retry).
- API 35 · 2.6.1: attempt-1 pass likely restored.
- Overall run time down ~5-7 min (no wasted 300s retry loops).

### 3. `.lovable/plan.md` note
Add one line: "2026-07-15: Dropped API 35 · Maestro 1.39.0 (empirically unrecoverable — driver reinstall fails). API 35 covered by 1.40.3 (primary) + 2.6.1 (canary)."

### Not doing (out of scope)
- No changes to Maestro flow YAML.
- No changes to app code.
- No changes to signing / gradle steps.

### Verification after edit
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/signed-apk-smoke.yml'))"` — YAML valid.
- Grep confirms `pm install-existing` appears exactly once (in retry branch only).
- Matrix `include:` block has 4 entries, not 5.

### Followup (after next CI run)
- If API 35 attempt-1 pass ratio returns to v1.0.27 level (green first try), consider promoting 1.40.3 as the API 35 hard-gate and demoting 2.6.1 to canary-only.
- If attempt-1 still flakes, investigate `apply_api35_mitigations`'s other pre-install commands (deviceidle whitelist etc.) — telemetry ne suggest kiya that ANY pre-install `dev.mobile.maestro` command emits "unknown package" errors that may shift timing.

Confirm karo toh build mode mein switch karke exact 3 edits kar deta hoon.
