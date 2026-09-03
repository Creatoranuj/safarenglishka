# Skill: supabase-architect-auditor

**Goal:** no table is either unreachable or wide open.

## Rules (enforced from migrations dated 20260903 onward; older files are frozen history)
1. Every `CREATE TABLE public.x` migration must, in the same file and order: `GRANT` → `ENABLE ROW LEVEL SECURITY` → `CREATE POLICY`. Guard: `supabase-rls` (blocking).
2. `GRANT` is scoped to what the policies actually allow. No `anon` grant unless a policy permits anon reads. `service_role` always for edge/admin paths.
3. Roles live in a separate `user_roles` table read through a `SECURITY DEFINER` `has_role()`. Never a role column on profiles.
4. Every `SECURITY DEFINER` function pins `SET search_path = public`. Guard flags a missing one.
5. No `CHECK` constraint on time (`expires_at > now()`) — use a trigger.
6. Never grant `EXECUTE` on admin RPCs to `PUBLIC`/`anon`.
7. Never store secrets (service-role key, API keys) in tables.

## Repo anchors
`supabase/migrations/`, `scripts/guards/guards.mjs` (`supabase-rls`)
