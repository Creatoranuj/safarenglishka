## Ship Batch 2 — Execution Plan

Scope: 5 items from last frog-eye audit. No new features. Batched parallel edits + verification.

### Items

**1. `src/pages/ArchiveBookReader.tsx` — AbortController fix (MEDIUM)**
- Wrap `archive.org/metadata/${identifier}` fetch with `AbortController`
- Return `() => controller.abort()` from `useEffect` cleanup
- Guard all `setState` calls with `!controller.signal.aborted`
- Fixes race condition on rapid identifier changes + "setState on unmounted" warnings

**2. `src/lib/nativeChrome.ts` — Idempotent init (MEDIUM)**
- Add module-level `initialized` boolean guard
- Store all 4 `Keyboard.addListener` handles in a `subs: PluginListenerHandle[]` array
- Export `disposeNativeChrome()` that calls `sub.remove()` on each and resets `initialized`
- Prevents listener stacking on HMR / theme flip

**3. `capacitor.config.ts` — Trim `allowNavigation` (LOW)**
- Check if `raw.githubusercontent.com` is referenced anywhere in `src/`
- If unused → remove from `allowNavigation` array
- If used → leave + note the caller

**4. Supabase RLS/GRANT lint sweep (read-only)**
- Run `supabase--linter`
- Run diagnostic queries from `supabase-architect-auditor` skill:
  - RLS-disabled public tables
  - Policies with `qual = 'true'`
  - SECURITY DEFINER fns missing `search_path` (already verified 0 via db-functions dump)
  - Public tables missing GRANT to `authenticated`
- Surface findings as a report. No SQL executed this batch.

**5. Admin bootstrap migration — BLOCKED on UUID**
- Waiting for you to paste `naveenbharatprism@gmail.com`'s auth UUID
- Once received: one-shot `INSERT INTO user_roles (user_id, role) VALUES ('<uuid>', 'admin') ON CONFLICT DO NOTHING` via `supabase--migration`
- **Will stop and confirm before running** (per prior rule)

### Verification per item
| Item | Check |
|---|---|
| 1 | `rg "AbortController" src/pages/ArchiveBookReader.tsx` + tsgo |
| 2 | `rg "disposeNativeChrome\|initialized" src/lib/nativeChrome.ts` + tsgo |
| 3 | `rg "raw.githubusercontent" src/` |
| 4 | Linter JSON output + query results in report |
| 5 | Deferred |

### Delta table format (final report)
Before → After columns for each item, verified-by column.

### Rules
- Batch parallel file edits
- No new features
- Stop before item 5 to confirm UUID
- End with: "Used the senior-architect-audit + supabase-architect-auditor + debugging-capacitor skills."

### Open question
**Paste the admin UUID** (from Supabase Dashboard → Authentication → Users → copy User UID for `naveenbharatprism@gmail.com`) so item 5 can ship in the same turn. Otherwise items 1–4 ship now and item 5 waits.
