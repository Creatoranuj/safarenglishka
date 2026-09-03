#!/usr/bin/env node
/**
 * PDF / asset link health report.
 *
 * Why this exists: `lesson_pdfs` and `materials` are RLS-locked to paying
 * students (correct), so nobody can audit those links from outside. A dead
 * Drive link or a revoked jsDelivr path stays invisible until a student
 * taps it mid-revision. This script reads every stored URL with the service
 * role key and probes each one.
 *
 * Usage (never commit the key — export it in your shell):
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/check-pdf-links.mjs
 *
 * Optional:
 *   CONCURRENCY=8   parallel probes (default 8)
 *   TIMEOUT_MS=15000
 *
 * Exit code 1 when any link is broken, so it can be wired to a schedule.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 15000);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}

/** Tables to audit: [table, urlColumn, labelColumn]. */
const SOURCES = [
  ['lesson_pdfs', 'file_url', 'file_name'],
  ['materials', 'file_url', 'title'],
  ['books', 'cover_url', 'title'],
];

async function fetchRows(table, urlCol, labelCol) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const url =
      `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}` +
      `?select=id,${urlCol},${labelCol}&${urlCol}=not.is.null&order=id`;
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (!res.ok) {
      console.error(`  ! ${table}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return rows;
    }
    const page = await res.json();
    rows.push(...page.map((r) => ({ table, id: r.id, url: r[urlCol], label: r[labelCol] })));
    if (page.length < PAGE) break;
  }
  return rows;
}

/**
 * HEAD first (cheap). Many CDNs and Google Drive reject HEAD, so fall back to
 * a 1-byte ranged GET before declaring a link dead.
 */
async function probe(target) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(target, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        headers: { Range: 'bytes=0-0' },
        signal: ctrl.signal,
      });
    }
    return { status: res.status, type: res.headers.get('content-type') || '' };
  } catch (e) {
    return { status: 0, type: '', error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const all = [];
for (const [table, urlCol, labelCol] of SOURCES) {
  const rows = await fetchRows(table, urlCol, labelCol);
  console.log(`${table}: ${rows.length} links`);
  all.push(...rows);
}

if (all.length === 0) {
  console.log('\nNo links found — check that the service role key is correct.');
  process.exit(2);
}

console.log(`\nProbing ${all.length} links (concurrency ${CONCURRENCY})…\n`);

const results = await mapLimit(all, CONCURRENCY, async (row) => ({
  ...row,
  ...(await probe(row.url)),
}));

const broken = results.filter((r) => r.status === 0 || r.status >= 400);
const suspicious = results.filter(
  (r) =>
    r.status >= 200 &&
    r.status < 400 &&
    r.type &&
    !/pdf|octet-stream|image\//i.test(r.type),
);

console.log(`OK:         ${results.length - broken.length}`);
console.log(`BROKEN:     ${broken.length}`);
console.log(`SUSPICIOUS: ${suspicious.length} (reachable but not a PDF/image — often a login or "quota exceeded" HTML page)\n`);

for (const r of broken) {
  console.log(`BROKEN [${r.table}] ${r.label || r.id} → ${r.status || r.error}\n        ${r.url}`);
}
for (const r of suspicious) {
  console.log(`SUSPECT [${r.table}] ${r.label || r.id} → ${r.type}\n        ${r.url}`);
}

process.exit(broken.length > 0 ? 1 : 0);
