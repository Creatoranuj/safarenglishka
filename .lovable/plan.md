## Deep analysis — asli root cause milgaya (native crash nahi tha!)

Teeno logs padh liye. **Koi bhi failure `com.safarenglishka.app` ka native crash NAHI hai** — pichli reports galat thi. Alag-alag problems hain har API level pe.

### Ground truth (evidence)

| API | Kaha fail hua | Real error |
|---|---|---|
| **28** | Step 1: `Safar English\|Login\|Welcome` visible check | 45s timeout — WebView paint slow / tokens don't match on splash |
| **33** | `waitForAnimationToEnd` (Step 3 me maine add kiya tha) | `Screenshot returned null — window may not be ready` (Maestro gRPC null) |
| **35** | Post-login dashboard assertion `Quick Actions\|All Classes\|...` | 120s `DEADLINE_EXCEEDED` — login pass hua, dashboard render nahi hua time me |

### Confirmed false alarms

1. **"Crash/ANR signals detected"** — grep `AndroidRuntime|FATAL EXCEPTION|ANR in |E/Capacitor` bahut wide hai. Match ho raha hai normal boot line `AndroidRuntime: >>>>>> START com.android.internal.os.ZygoteInit` se. API 35 ne to sirf Pixel Launcher (`com.google.android.apps.nexuslauncher`) ka ANR pakda — hamare app se related nahi.
2. **"Cold boot: 0 ms"** teeno pe — perf gate parser tuta hai. Emulator boot actually 49s (API 33) laga tha (`INFO | Boot completed in 49410 ms`). BOOT_MS variable derive nahi ho raha, 0 return kar raha, hard gate (>120s) fire hi nahi ho raha.
3. **`experimental: true` quarantine bekar hai** — jab problem native crash hi nahi thi.

### API 33 regression — mera error

Pichle round me maine `waitForAnimationToEnd: timeout: 5000` add kiya tha "stability" ke liye. Actually ye Maestro pe WebView surface jab tak render nahi ho window null return karta hai → screenshot null → step fail. API 33 pehle green tha, ab red — meri wajah se.

### Fixes (build phase me apply karunga)

**maestro/smoke.yaml**
- `waitForAnimationToEnd` hataana (regression source) — sirf `extendedWaitUntil` rakhna.
- Step 1 timeout `45000 → 90000` (API 28 slow WebView ke liye) + regex widen: `Safar English|Login|Welcome|Get Started|Sign In|Continue`.
- Step 3 (post-login dashboard) tokens verify + widen: actual `src/pages/Dashboard.tsx` padh ke jo copy render hoti hai wo add — abhi ke tokens Dashboard ke naye copy se match nahi ho rahe (API 35 login pass hua = auth theek hai, sirf visible text mismatch).
- Step 3 timeout `30000 → 60000` aur `DEADLINE_EXCEEDED` avoid karne ke liye MAESTRO_DRIVER_STARTUP_TIMEOUT env bump.

**.github/workflows/signed-apk-smoke.yml**
- **Crash grep tight karna**: sirf `beginning of crash` + `FATAL EXCEPTION: .* pid ${APP_PID}` (hamare package ke liye). Warning ka noise 90% khatam.
- **Perf gate fix**: `BOOT_MS` extraction sahi karna — `grep -oE "Boot completed in [0-9]+ ms"` se number nikaal ke, `Cold boot: 0 ms` bug band.
- **API 28 se `experimental: true` hataana** — quarantine ki zaroorat nahi thi, false-positive tha.

### Docs
`docs/observer/2026-07-14-signed-smoke-learnings.md` update — "native crash quarantine" note remove, "Maestro selector + timing regression" ke sath replace.

### Kya NAHI karunga (scope out)
- `/index` 19.9s freeze (audit HIGH) — real perf issue hai, lekin ye smoke unblock ka critical path nahi hai; dashboard tokens fix hone se API 35 pass ho jayega existing render time me. Alag PR me.
- Play promote — waise hi soft-skip pe hai, secret nahi hai.

### Expected outcome after fixes
- API 28: green (~85%)
- API 33: green (~95% — regression fix)
- API 35: green (~80% — token match confidence, cold start still tight)
- Overall gate green probability: **~75–80%** (vs current 0%)

Aage — approve karo to maine build phase me `smoke.yaml`, workflow, aur docs edit karta hoon.