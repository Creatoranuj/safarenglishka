#!/usr/bin/env node
/**
 * Anon write-grant regression guard.
 *
 * The v1.5.0 audit found that the `anon` (logged-out) Postgres role still held
 * INSERT/UPDATE/DELETE grants on 10 public tables. RLS blocked the writes, but
 * the grants were wider than any policy — one permissive policy away from a
 * real hole. They were revoked; this guard makes sure they never come back.
 *
 * Requires: SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 * Calls the admin-only RPC public.anon_write_grants(), which is executable by
 * service_role only. Exits 1 if any anon write grant exists.
 */

const BASE = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!BASE || !KEY) {
  console.warn('[anon-grants] skipped - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.');
  process.exit(0);
}

const res = await fetch(`${BASE}/rest/v1/rpc/anon_write_grants`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});

if (!res.ok) {
  console.error(`[anon-grants] RPC failed [${res.status}]: ${await res.text()}`);
  process.exit(1);
}

const rows = await res.json();

if (!Array.isArray(rows)) {
  console.error('[anon-grants] unexpected response shape:', rows);
  process.exit(1);
}

if (rows.length === 0) {
  console.log('[anon-grants] OK - anon role has no INSERT/UPDATE/DELETE grant on any public table.');
  process.exit(0);
}

console.error(`[anon-grants] FAIL - ${rows.length} public table(s) writable by the anon role:`);
for (const r of rows) console.error(`  - ${r.table_name}: ${r.privileges}`);
console.error('\nFix with a migration, e.g.:');
for (const r of rows) console.error(`  REVOKE INSERT, UPDATE, DELETE ON public.${r.table_name} FROM anon;`);
process.exit(1);
