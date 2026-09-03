#!/usr/bin/env node
/**
 * Logical backup of the business-critical Supabase tables via PostgREST.
 *
 * Why this exists: the project runs on the Supabase free tier, which gives no
 * point-in-time recovery and no self-serve restore. A bad migration, an
 * accidental DELETE, or a project pause/expiry would be unrecoverable without
 * an off-site copy. This script writes one JSON file per table plus a
 * manifest, so the data can always be re-imported.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-supabase.mjs [outDir]
 *
 * Read-only: it never writes to the database.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OUT = process.argv[2] || 'backup';
const PAGE = 1000;

/** Tables whose loss would be unrecoverable (money, access, user content). */
const TABLES = [
  'profiles', 'user_roles', 'courses', 'chapters', 'lessons', 'lesson_pdfs',
  'lesson_chapters', 'enrollments', 'razorpay_payments', 'payment_requests',
  'user_subscriptions', 'subscription_plans', 'quizzes', 'questions',
  'quiz_attempts', 'lesson_progress', 'document_progress', 'user_progress',
  'smart_notes', 'student_notes', 'study_materials', 'books', 'doubts',
  'doubt_sessions', 'doubt_replies', 'community_posts', 'community_comments',
  'audit_log',
];

if (!BASE || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function fetchTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const url = `${BASE}/rest/v1/${table}?select=*&order=id.asc&limit=${PAGE}&offset=${from}`;
    const res = await fetch(url, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      // `order=id.asc` fails on tables without an `id` column - retry unordered.
      if (res.status === 400 && from === 0) {
        const retry = await fetch(
          `${BASE}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${from}`,
          { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
        );
        if (retry.ok) {
          const page = await retry.json();
          rows.push(...page);
          if (page.length < PAGE) break;
          continue;
        }
      }
      throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const stamp = new Date().toISOString().slice(0, 10);
const dir = join(OUT, stamp);
await mkdir(dir, { recursive: true });

const manifest = { generated_at: new Date().toISOString(), tables: {}, errors: {} };

for (const table of TABLES) {
  try {
    const rows = await fetchTable(table);
    await writeFile(join(dir, `${table}.json`), JSON.stringify(rows));
    manifest.tables[table] = rows.length;
    console.log(`ok   ${table.padEnd(24)} ${rows.length} rows`);
  } catch (err) {
    manifest.errors[table] = String(err.message || err);
    console.warn(`warn ${table.padEnd(24)} ${err.message || err}`);
  }
}

await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nBackup written to ${dir}`);
if (Object.keys(manifest.errors).length) {
  console.error(`${Object.keys(manifest.errors).length} table(s) failed - see manifest.json`);
  process.exit(2);
}
