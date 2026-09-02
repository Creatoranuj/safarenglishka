# Safar English — full audit (2026-09-02)

**Rating: 3.5/5** — architecture aur security ki neev sahi hai (roles alag table
me, has_role, webhook-first enrollment, RLS everywhere); asli debt observability
aur AI-failure handling me thi, jo is pass me theek ki gayi. Ek CRITICAL config
issue abhi bhi owner-action pending hai.

## Findings

### [CRITICAL] [CONFIG] AI gateway key unregistered — poora AI stack down
**Where:** Supabase edge-function secret `LOVABLE_API_KEY` (project `wegamscqtvqhxowlskfm`)
**Evidence:**
```text
POST /functions/v1/ai-health → 200 {"ok":false,"code":"gateway_unauthorized"}
```
**Why it matters:** chatbot, resolve-doubt, summarize-video aur
deep-search-lecture — chaar features ek hi stale key se mar rahe hain. Har user
question "⚠️ AI abhi busy hai" par khatam hota tha.
**Fix:** owner ko key rotate + edge functions redeploy karni hai (steps
`docs/manual/ai-chatbot.md` me). Code-side sab kuch is PR me ho chuka hai.
**Status:** owner-action pending. Code ab honestly degrade karta hai.

### [HIGH] [OBS] Har gateway failure ek hi vague line me collapse hota tha
**Where:** `supabase/functions/chatbot/index.ts`
**Why it matters:** stale key (days-long outage) aur 30-second 429 blip dono ek
jaise dikhte the — outage app se diagnose karna namumkin.
**Fix (applied):** naya `classifyGatewayFailure()` in `_shared/aiGateway.ts` →
stable codes `key_missing | key_unregistered | no_credits | rate_limited |
timeout | bad_request | upstream_error`, har ek ki apni copy, plus `retryable` /
`needsAdmin` flags response JSON me.

### [HIGH] [UX] AI down hote hi chatbot dead-end ho jata tha
**Where:** `chatbot/index.ts`, `ChatWidget.tsx`
**Fix (applied):** `buildDegradedAnswer()` FAQ → knowledge base → course
catalogue se jawab deta hai jab model reachable na ho; ChatWidget `needsAdmin`
par persistent banner dikhata hai (`role="status"`, destructive tokens, hardcoded
colors nahi).

### [HIGH] [RELY] Maestro emulator crash — product bug samjha ja raha tha
**Where:** `.github/workflows/maestro-android.yml`
**Evidence:** run #73 logcat — `Fatal signal 5 (SIGTRAP)` in
`libwebviewchromium.so` 101.0.4951.61, "crashed too many times, killing!".
**Fix (applied earlier, on `main` as `cd4e5fb`):** WebView command-line override
(`--in-process-gpu`, disabled rasterization) hata diya. Login har run me pass
hota tha — regression product side kabhi thi hi nahi.

### [MEDIUM] [UX] Profile skeleton dead-end
**Fix (applied earlier):** `Profile.tsx` ab self-fetch + bounded loading/error/
retry karta hai; pehle sirf cached `AuthContext.authProfile` par depend karke
hamesha skeleton me atak sakta tha.

### [MEDIUM] [PERF] Dashboard first frame overload
**Fix (applied earlier):** HeroCarousel + UpcomingLiveSessions + UpcomingSchedule
`lazy()` + `Suspense` skeletons ke peechhe. Pehla frame = header + active-course
card.

### [MEDIUM] [SEC] CI artifacts me session data leak ka risk
**Where:** Maestro job screenshots + view-hierarchy JSON upload karta hai.
**Fix (policy, documented):** E2E login ke liye dedicated student account hi —
admin credentials kabhi nahi. `docs/manual/ci-e2e.md` me likha gaya.

### [MEDIUM] [SEC] Rotated Razorpay secret
`RAZORPAY_KEY_SECRET` rotate ho chuki hai (purani 401 deti hai). Test keys owner
khud daalega; repo me kabhi commit nahi.

### [LOW] [MAINT] Dependency audit — 6 real findings
Upgrade tak red rehne dein; suppress na karein.

### [LOW] [OBS] Legacy `console.error(err)` sites
`src/hooks/**`, `src/lib/**` me kai jagah bare `console.error` hai. Forwarder ki
wajah se ye already Sentry pahunchte hain; jab file chhuye tab
`reportError(err, { surface })` me upgrade karein — ek bada sweep nahi.

## Skill-wise verdict

| Skill | Verdict |
| --- | --- |
| app-crash-shield | Pass — forwarder + ErrorBoundary maujood; `catch {}` sites doc me flagged |
| asset-optimization | Pass — favicon/launcher assets regenerate ho chuke |
| capacitor-back-button | Pass — single mounted handler, history push/back pattern ChatWidget me sahi |
| capacitor-video-player-master | N/A is pass me — koi change nahi, teardown pehle se maujood |
| console-error-triage | Applied — AI path ab structured codes deta hai, vague spam nahi |
| mobile-view-expert | Pass — banner semantic tokens par, safe areas pehle se |
| senior-architect-audit | Ye document |
| soft-touch | Pass — koi arbitrary duration add nahi ki gayi |
| supabase-architect-auditor | Guidance `docs/manual/supabase.md` me; koi schema change is PR me nahi |
| red-team-security-audit | Threat table `docs/manual/security.md` me |
| perf-exam-ready | Dashboard/Profile fixes pehle land ho chuke |
| sentry-triage | Noise list documented; AI errors ab code-tagged |

## Fix plan

1. **Owner (30s):** `LOVABLE_API_KEY` rotate + edge functions redeploy → `ai-health` `{"ok":true}`.
2. **Owner:** Razorpay test keys edge-function secrets me.
3. **Backlog:** dependency upgrades (6), bare `console.error` → `reportError` opportunistic sweep, real-device E2E.
