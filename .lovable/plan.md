## Scope — one turn, two items

### Item 1: `phone_otps` intent-lock migration

**SQL (single migration):**
```sql
COMMENT ON TABLE public.phone_otps IS
  'Server-only. Written/read exclusively by send-phone-otp / verify-phone-otp edge functions via service_role. Intentionally has no RLS policies — do NOT add a client-side policy. See docs/audit/pr5-post-ship-audit.md.';

REVOKE ALL ON public.phone_otps FROM anon, authenticated;
GRANT ALL ON public.phone_otps TO service_role;
```

**Why safe:**
- Phone login is temporarily disabled (`PhoneLogin.tsx` per allow-list comment).
- Even if enabled, the two edge functions (`send-phone-otp`, `verify-phone-otp`) use `service_role`, which is unaffected by these grants.
- No app code touches `phone_otps` from the client — verified via `rg`.
- Reversible: `GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_otps TO authenticated;` if ever needed.

**Approval:** propose via `supabase--migration`, you review and click approve. No API key needed.

**Post-migration:** update `docs/audit/pr5-post-ship-audit.md` — mark the `phone_otps` finding as `[RESOLVED]`.

---

### Item 2: README OBS 0029 note

Append a short "Security scanner expectations" section to `README.md` (after Observability):

```markdown
## Security scanner expectations

Every run of `security--run_security_scan` reports **9 warnings** on linter
check `0029` (`security_definer_function_executable_by_authenticated`).
This is **expected** — those 9 SECURITY DEFINER functions (`has_role`,
`get_user_role`, `get_quiz_questions`, `verify_enrollment_for_attendance`,
`get_course_bundle`, `get_dashboard_snapshot`, `get_user_profiles_admin`,
`get_platform_stats`, `get_course_lesson_stats`) each scope internally to
`auth.uid()` and are safe to expose to `authenticated`. See the ignore
justifications in the security-memory. Any **new** warn on 0029 for a
different function is a real finding and must be reviewed.
```

Zero code change.

---

## Files touched

- New: `supabase/migrations/<timestamp>_phone_otps_intent_lock.sql` (via migration tool).
- Edit: `README.md` (+~12 lines).
- Edit: `docs/audit/pr5-post-ship-audit.md` (mark `phone_otps` as RESOLVED).

## Out of scope (deferred as before)

- HIBP toggle — aap khud Dashboard me.
- `LessonView` split, `whatsnew-hi-IN`, OBS internal-schema move — backlog.
- **`webapp-to-capacitor` polish pass** — aapne mention kiya, but this project is **already** a Capacitor app with 84 tables, full APK build workflow, and store-readiness docs (`docs/STORE-READINESS.md`). The `webapp-to-capacitor` skill is for greenfield migrations. If you want a **polish audit** using its Step 4 checklist (safe-areas, keyboard, splash, offline, account deletion), I'll do that as a **separate senior-architect-audit-style read-only pass** next turn — not bundled here.

## Skill hint

- No GitHub Skill Importer needed — no new APK/Capacitor pipeline work.
- `senior-architect-audit` will govern the *next* turn (webapp-to-capacitor polish audit) if you approve.

## Open question

Migration ka `REVOKE ALL FROM anon, authenticated` include karun (recommended — makes intent enforced not just documented), ya sirf `COMMENT ON TABLE` (softer, docs-only)?
