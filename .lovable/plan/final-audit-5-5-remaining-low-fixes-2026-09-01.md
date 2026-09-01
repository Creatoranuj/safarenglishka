# Final Audit → 5/5: remaining LOW fixes

Two low-risk maintenance fixes block the last notch to a clean 5/5. Both are
correctness/dead-code, not behavioral changes. The third item is a dashboard
toggle (no code).

## Fix 1 — Remove dead Capgo ProGuard rules
**File:** `android/app/proguard-rules.pro` (lines 48-55)
CapacitorUpdater (Capgo) was removed from the project (`capacitor.config.ts`
explicitly notes "CapacitorUpdater (Capgo) removed — paid SaaS, not used"; no
package import or plugins.json entry references it). The R8 keep rules for
`ee.forgr.capacitor_updater.**` are dead — R8 ignores classes not on the
classpath, so they're harmless, but they're misleading dead code.
**Change:** comment out the three keep/dontwarn lines with a note that the
plugin was removed 2026.

## Fix 2 — Correct the stale `search_lectures` integration test
**File:** `src/test/definer-grants.integration.test.ts`
The test asserts `search_lectures` is "publicly callable" (`expect(error).toBeNull()`).
Reality: `search_lectures` is **authenticated-only** — anon lacks EXECUTE and the
function body raises `'Authentication required'` when `auth.uid()` is null. The
frontend caller (`useLectureSearch.ts`) uses the authenticated client. The test
would fail when run against the live DB.
**Change:** flip the assertion to `expect(error).toBeTruthy()` (anon denied) and
fix the header comment to list `search_lectures` under auth-only, not anon-callable.

## Fix 3 — Enable Leaked Password Protection (dashboard, no code)
Supabase Dashboard → Authentication → Providers → Email → "Leaked password
protection" → ON. Cannot be set via migration; project owner must toggle it.
