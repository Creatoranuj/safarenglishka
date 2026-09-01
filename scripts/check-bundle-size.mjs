#!/usr/bin/env node
/**
 * Bundle size budget guardrail. Runs after `vite build`.
 *
 * Fails the build (exit 1) if:
 *   - Any single JS chunk in dist/assets/ > MAX_CHUNK_KB gzipped
 *   - Entry chunk(s) referenced from dist/index.html > MAX_ENTRY_KB gzipped
 *
 * Set NB_SKIP_SIZE_CHECK=1 to bypass (useful for emergency releases).
 * Tune budgets via NB_MAX_CHUNK_KB / NB_MAX_ENTRY_KB env vars.
 */
import { readFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DIST = "dist";
const ASSETS = join(DIST, "assets");
const MAX_CHUNK_KB = Number(process.env.NB_MAX_CHUNK_KB ?? 280);
const MAX_ENTRY_KB = Number(process.env.NB_MAX_ENTRY_KB ?? 180);

// Named per-chunk budgets (gzip KB). SINGLE SOURCE OF TRUTH — `build-apk.yml`
// used to re-implement these inline in shell, which drifted from this script.
// Bump deliberately, with a PR note explaining why.
const NAMED_BUDGETS = [
  { label: "vendor-react", prefix: "vendor-react-", kb: Number(process.env.NB_MAX_VENDOR_REACT_KB ?? 140) },
  { label: "vendor-motion", prefix: "vendor-motion-", kb: Number(process.env.NB_MAX_VENDOR_MOTION_KB ?? 80) },
  { label: "vendor-supabase", prefix: "vendor-supabase-", kb: Number(process.env.NB_MAX_VENDOR_SUPABASE_KB ?? 90) },
];
// Sum of every vendor-*.js chunk, ENTRY-REFERENCED OR NOT — a ceiling on the
// total vendor weight a user can end up downloading across a session.
// NOTE: the old inline gate in build-apk.yml called this "total-initial" with a
// 900KB cap, which was wrong twice over: it counted lazily-imported vendors
// (sentry / md / pdf / charts / pptx) as initial payload, and it sat ~7KB under
// its own ceiling — so any new dep would have failed the release build for a
// number that never described the initial payload. The real initial payload is
// the entry budget above (index.html-referenced chunks).
const MAX_VENDOR_TOTAL_KB = Number(process.env.NB_MAX_VENDOR_TOTAL_KB ?? 1000);

// Known heavy vendors that are ONLY reachable through a dynamic import and are
// never referenced from index.html. They get a separate, higher cap so the
// strict per-chunk budget stays meaningful for everything else instead of
// being blanket-raised (or bypassed with NB_SKIP_SIZE_CHECK=1).
const MAX_LAZY_CHUNK_KB = Number(process.env.NB_MAX_LAZY_CHUNK_KB ?? 450);
const LAZY_CHUNK_ALLOWLIST = [
  // pptx-preview bundles its own renderer + deps in a single ES file (~411KB gz).
  // Loaded only when a user opens a .pptx in OfficeDocViewer.
  /^vendor-pptx-/,
  /^pptx-preview[.-]/,
];

// GitHub Actions step summary (no-op outside CI).
const summaryLines = [];
const summarize = (line) => summaryLines.push(line);
const flushSummary = () => {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file || !summaryLines.length) return;
  try {
    appendFileSync(file, `### 📏 JS bundle-size gate\n${summaryLines.join("\n")}\n`);
  } catch {
    /* summary is best-effort */
  }
};


if (process.env.NB_SKIP_SIZE_CHECK === "1") {
  console.log("[bundle-size] skipped via NB_SKIP_SIZE_CHECK=1");
  process.exit(0);
}

let assetFiles = [];
try {
  assetFiles = readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
} catch {
  console.log("[bundle-size] no dist/assets directory — skipping");
  process.exit(0);
}

const gzipSize = (path) => gzipSync(readFileSync(path)).length;

// Entry chunks — any <script src="/assets/*.js"> referenced from index.html
let entryRefs = [];
let entryNames = new Set();
try {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  for (const m of html.matchAll(/<(script|link)\b[^>]*(?:src|href)=["']\/assets\/([^"']+\.js)["'][^>]*>/g)) {
    const [, tag, name] = m;
    const rel = tag === "link" ? m[0].match(/\brel=["']([^"']+)["']/)?.[1] : undefined;
    const kind = tag === "script" ? "script" : `link:${rel ?? "unknown"}`;
    entryRefs.push({ name, kind, html: m[0].replace(/\s+/g, " ") });
    entryNames.add(name);
  }
} catch {
  /* no index — keep entryNames empty */
}

const rows = assetFiles.map((name) => {
  const path = join(ASSETS, name);
  const raw = statSync(path).size;
  const gz = gzipSize(path);
  return { name, raw, gz, isEntry: entryNames.has(name) };
});

rows.sort((a, b) => b.gz - a.gz);

const fmt = (n) => `${(n / 1024).toFixed(1)}KB`;
const auditVendorReact = () => {
  const row = rows.find((r) => r.name.startsWith("vendor-react-") && r.name.endsWith(".js"));
  if (!row) return;
  let source = "";
  try {
    source = readFileSync(join(ASSETS, row.name), "utf8");
  } catch {
    return;
  }
  const markers = [
    "react-dom/server", "renderToString", "renderToStaticMarkup",
    "react-router", "@tanstack", "framer", "motion", "radix", "cmdk",
    "vaul", "sonner", "hook-form", "zod", "markdown", "prism",
    "pdf", "sentry", "lucide", "react-dom", "scheduler",
  ];
  console.error("\n[bundle-size] vendor-react audit:");
  console.error(`  - ${row.name}: ${fmt(row.gz)} gzip, ${fmt(row.raw)} raw`);
  if (row.gz > 80 * 1024 && row.raw > 300 * 1024) {
    console.error("  - likely cause: vendor-react is clean but unminified; check Vite/Rolldown JS minifier config");
  }
  for (const marker of markers) {
    console.error(`  - ${marker}: ${source.includes(marker)}`);
  }
};
console.log("\n[bundle-size] gzipped sizes:");
for (const r of rows.slice(0, 15)) {
  console.log(`  ${r.isEntry ? "★" : " "} ${fmt(r.gz).padStart(8)}  ${r.name}`);
}

const failures = [];
const entryTotalGz = rows
  .filter((r) => r.isEntry)
  .reduce((sum, r) => sum + r.gz, 0);

if (entryTotalGz > MAX_ENTRY_KB * 1024) {
  failures.push(
    `Initial entry payload ${fmt(entryTotalGz)} > budget ${MAX_ENTRY_KB}KB gzipped`,
  );
}
summarize(`- **entry:** ${fmt(entryTotalGz)} / ${MAX_ENTRY_KB}KB`);

// Named per-chunk budgets (vendor-react / motion / supabase).
for (const budget of NAMED_BUDGETS) {
  const row = rows.find((r) => r.name.startsWith(budget.prefix));
  if (!row) {
    console.log(`[bundle-size] no ${budget.label} chunk — skipping its budget`);
    continue;
  }
  summarize(`- **${budget.label}:** ${fmt(row.gz)} / ${budget.kb}KB`);
  if (row.gz > budget.kb * 1024) {
    failures.push(`${budget.label} (${row.name}) ${fmt(row.gz)} > budget ${budget.kb}KB gzipped`);
  }
}

// Vendor weight ceiling (all vendor-*.js, eager + lazy).
const vendorTotalGz = rows
  .filter((r) => r.name.startsWith("vendor-"))
  .reduce((sum, r) => sum + r.gz, 0);
summarize(`- **vendor-total (eager + lazy):** ${fmt(vendorTotalGz)} / ${MAX_VENDOR_TOTAL_KB}KB`);
if (vendorTotalGz > MAX_VENDOR_TOTAL_KB * 1024) {
  failures.push(
    `Vendor total (all vendor-*.js) ${fmt(vendorTotalGz)} > budget ${MAX_VENDOR_TOTAL_KB}KB gzipped`,
  );
}


for (const r of rows) {
  const isLazyAllowed =
    !r.isEntry && LAZY_CHUNK_ALLOWLIST.some((re) => re.test(r.name));
  const cap = isLazyAllowed ? MAX_LAZY_CHUNK_KB : MAX_CHUNK_KB;
  if (r.gz > cap * 1024) {
    failures.push(
      `Chunk ${r.name} ${fmt(r.gz)} > budget ${cap}KB gzipped${isLazyAllowed ? " (lazy vendor)" : ""}`,
    );
  } else if (isLazyAllowed && r.gz > MAX_CHUNK_KB * 1024) {
    console.log(
      `[bundle-size] lazy vendor allowed: ${r.name} ${fmt(r.gz)} (cap ${cap}KB, never in entry)`,
    );
  }
}

console.log(`\n[bundle-size] initial entry total: ${fmt(entryTotalGz)} (budget ${MAX_ENTRY_KB}KB)`);
console.log(`[bundle-size] vendor total (eager + lazy): ${fmt(vendorTotalGz)} (budget ${MAX_VENDOR_TOTAL_KB}KB)`);

flushSummary();


if (failures.length) {
  const entryRows = rows.filter((r) => r.isEntry).sort((a, b) => b.gz - a.gz);
  console.error("\n[bundle-size] initial entry diagnostics:");
  if (!entryRows.length) {
    console.error("  - No /assets/*.js references found in dist/index.html");
  } else {
    for (const r of entryRows) {
      const reasons = entryRefs
        .filter((ref) => ref.name === r.name)
        .map((ref) => ref.kind)
        .join(", ");
      console.error(`  - ${fmt(r.gz).padStart(8)}  ${r.name}  (${reasons || "referenced"})`);
    }
  }

  auditVendorReact();

  console.error("\n[bundle-size] FAIL:");
  for (const f of failures) console.error("  - " + f);
  console.error("\nSet NB_SKIP_SIZE_CHECK=1 to bypass, or tune NB_MAX_*_KB.");
  process.exit(1);
}

console.log("[bundle-size] OK ✓");
