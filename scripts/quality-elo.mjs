#!/usr/bin/env node
/**
 * Quality ELO — one composite number for app health.
 *
 * Twelve tracks, each scored 0-100 from mechanical signals in the repo, then
 * weighted into a single "ELO" (800 floor, 2400 ceiling) so regressions are
 * visible in one line of CI output instead of buried in twelve reports.
 *
 * Usage:  node scripts/quality-elo.mjs            (human table)
 *         node scripts/quality-elo.mjs --json     (machine readable)
 *
 * Every check is read-only. This never touches the database or the network.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

/* ------------------------------- helpers -------------------------------- */

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const ALL = walk(SRC);
const CODE = ALL.filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !/[\\/]test[\\/]/.test(f));
const TESTS = ALL.filter((f) => /\.test\.(ts|tsx)$/.test(f));
const cache = new Map();
const read = (f) => {
  if (!cache.has(f)) cache.set(f, readFileSync(f, "utf8"));
  return cache.get(f);
};
const rel = (f) => f.slice(ROOT.length + 1);
const anyFile = (re, files = CODE) => files.some((f) => re.test(read(f)));
const countFiles = (re, files = CODE) => files.filter((f) => re.test(read(f))).length;

/** score = pass ratio of a list of [label, boolean] criteria */
function ratio(criteria) {
  const passed = criteria.filter(([, ok]) => ok);
  const score = Math.round((passed.length / criteria.length) * 100);
  const failures = criteria.filter(([, ok]) => !ok).map(([label]) => label);
  return { score, failures };
}

/* -------------------------------- tracks -------------------------------- */

const tracks = [];
const track = (name, weight, fn) => tracks.push({ name, weight, ...fn() });

track("Crash shield", 1.2, () => {
  const boundaries = countFiles(/class\s+\w*ErrorBoundary|componentDidCatch|<SafeBoundary/);
  const intervals = CODE.filter((f) => /setInterval\(/.test(read(f)));
  const intervalsCleared = intervals.filter((f) => /clearInterval\(/.test(read(f)));
  // Only component/hook files matter here: module singletons in src/lib install
  // app-lifetime listeners on purpose and have nothing to clean up.
  const listeners = CODE.filter(
    (f) =>
      // `signal.addEventListener("abort", ..., { once: true })` self-cleans.
      /(?<!signal\.)addEventListener\(/.test(read(f).replace(/signal\.addEventListener\(/g, "")) &&
      /[\\/](components|pages|hooks|contexts)[\\/]/.test(f),
  );
  const listenersCleaned = listeners.filter((f) => /removeEventListener\(/.test(read(f)));
  return ratio([
    ["no top-level ErrorBoundary", existsSync(join(SRC, "components/ErrorBoundary.tsx"))],
    ["fewer than 3 error boundaries in the tree", boundaries >= 3],
    ["lazy routes lack retry wrapper", existsSync(join(SRC, "lib/lazyWithRetry.ts"))],
    [
      `setInterval without clearInterval in ${intervals.length - intervalsCleared.length} file(s)`,
      intervals.length === intervalsCleared.length,
    ],
    [
      `addEventListener without removeEventListener in ${listeners.length - listenersCleaned.length} file(s)`,
      listeners.length === listenersCleaned.length,
    ],
    ["no global unhandledrejection handler", anyFile(/unhandledrejection/)],
  ]);
});

track("Asset optimization", 1.0, () => {
  const pub = walk(join(ROOT, "public"));
  const heavy = pub.filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f) && statSync(f).size > 250 * 1024);
  const pointers = ALL.filter((f) => f.endsWith(".asset.json"));
  const deadCdn = countFiles(/__l5e\//, CODE);
  return ratio([
    [`${heavy.length} public asset(s) over 250KB: ${heavy.map(rel).join(", ")}`, heavy.length === 0],
    [`${pointers.length} dead *.asset.json pointer file(s)`, pointers.length === 0],
    [`${deadCdn} file(s) reference the dead /__l5e CDN`, deadCdn === 0],
    ["no PNG size guard in the build", existsSync(join(ROOT, "scripts/check-png-sizes.mjs"))],
    ["no asset-integrity regression test", existsSync(join(SRC, "test/course-thumbs-exist.test.ts"))],
  ]);
});

track("Back button", 1.0, () => {
  const hook = join(SRC, "hooks/useAndroidBackButton.ts");
  const src = existsSync(hook) ? read(hook) : "";
  return ratio([
    ["no central back-button hook", Boolean(src)],
    ["single-listener guard missing", /setupPromise|singleton|alreadyRegistered|listenerRef/.test(src)],
    ["ordered priority chain missing", /step\d/i.test(src)],
    ["no double-tap exit guard", anyFile(/exitApp|ExitHint/)],
    ["no back-button regression test", TESTS.some((f) => /useAndroidBackButton/.test(rel(f)))],
  ]);
});

track("Video player", 1.1, () => {
  const players = CODE.filter((f) => /[\\/]video[\\/]/.test(f));
  const text = players.map(read).join("\n");
  return ratio([
    ["no unified player module", players.length > 0],
    [
      "player never releases its media surface on unmount",
      /return\s*\(\)\s*=>/.test(text) && /about:blank|pause\(\)|removeAttribute\("src"\)/.test(text),
    ],
    ["object URLs not revoked anywhere", anyFile(/revokeObjectURL/)],
    ["no fullscreen/system-bar sync", anyFile(/StatusBar|setOverlaysWebView|NavigationBar/)],
    ["no player regression test", TESTS.some((f) => /player|video/i.test(rel(f)))],
  ]);
});

track("Console triage", 0.9, () => {
  const raw = CODE.filter((f) => /console\.(log|warn|error|info|debug)\s*\(/.test(read(f)));
  const allow = ["src/lib/log.ts", "src/lib/nativeDebug.ts", "src/lib/reportError.ts"];
  const offenders = raw.map(rel).filter((f) => !allow.includes(f));
  return ratio([
    ["no logging wrapper (@/lib/log)", existsSync(join(SRC, "lib/log.ts"))],
    ["no console-usage budget guard", existsSync(join(ROOT, "scripts/check-console-usage.mjs"))],
    [`${offenders.length} file(s) still use raw console.*`, offenders.length <= 60],
    [`raw console.* count ${offenders.length} above the 100-file ceiling`, offenders.length <= 100],
  ]);
});

track("Mobile view", 1.1, () => {
  const text = CODE.map(read).join("\n");
  const smallTargets = (text.match(/className="[^"]*\b(h-6|h-7)\b[^"]*"/g) || []).length;
  return ratio([
    ["no safe-area insets used", /safe-area-inset|env\(safe-area/.test(text)],
    ["no min-h-11/44px tap-target sizing", /min-h-\[44px\]|min-h-11|h-11/.test(text)],
    ["no overflow-x guard on the shell", /overflow-x-hidden/.test(text)],
    ["keyboard inset handling missing", /Keyboard|keyboardWillShow|keyboard-height/.test(text)],
    ["fixed bottom bars ignore the bottom safe-area inset", /safe-area-inset-bottom/.test(text) || /pb-safe/.test(text)],
    [`informational: ${smallTargets} sub-32px height classes in the tree`, true],
  ]);
});

track("Architecture", 1.2, () => {
  const big = CODE.filter((f) => read(f).split("\n").length > 600).map(rel);
  const anyCasts = CODE.filter((f) => (read(f).match(/\bas any\b/g) || []).length > 0).length;
  return ratio([
    [`${big.length} file(s) over 600 lines: ${big.slice(0, 5).join(", ")}`, big.length <= 12],
    ["no service-role key reachable from src/ (good)", !anyFile(/SERVICE_ROLE/)],
    ["route code splitting missing", anyFile(/React\.lazy|lazyWithRetry\(/)],
    [`${anyCasts} file(s) use \`as any\``, anyCasts <= 25],
    ["no typecheck config", existsSync(join(ROOT, "tsconfig.app.json"))],
  ]);
});

track("Soft touch", 0.8, () => {
  const text = CODE.map(read).join("\n");
  return ratio([
    ["no haptics helper", /tapHaptic|Haptics\.impact/.test(text)],
    ["haptics used on fewer than 10 surfaces", countFiles(/tapHaptic|Haptics\./) >= 10],
    ["no press-state scale on CTAs", /active:scale-/.test(text)],
    ["no motion transitions", /transition-|animate-fade/.test(text)],
    ["no reduced-motion respect", /prefers-reduced-motion|motion-reduce/.test(text)],
  ]);
});

track("Supabase audit", 1.2, () => {
  const migDir = join(ROOT, "supabase/migrations");
  const migs = existsSync(migDir) ? readdirSync(migDir).filter((f) => f.endsWith(".sql")) : [];
  const sql = migs.map((f) => readFileSync(join(migDir, f), "utf8")).join("\n");
  const creates = (sql.match(/create table (if not exists )?public\./gi) || []).length;
  const rls = (sql.match(/enable row level security/gi) || []).length;
  const grants = (sql.match(/\bgrant\b/gi) || []).length;
  return ratio([
    ["no migrations tracked in repo", migs.length > 0],
    [`${creates} public tables vs ${rls} RLS enables`, creates === 0 || rls >= creates * 0.9],
    [`only ${grants} GRANT statements across migrations`, grants >= creates],
    ["no security-definer search_path pinning", /security definer[\s\S]{0,200}set search_path/i.test(sql)],
    ["no RLS/grant regression test", TESTS.some((f) => /definer-grants|policies|enrollment-bypass/.test(rel(f)))],
  ]);
});

track("Red team", 1.3, () => {
  const clientText = CODE.map(read).join("\n");
  // The anon/publishable JWT is designed to ship in the client. Only a
  // service_role token (or any secret-looking key) is an actual leak.
  const serviceRoleLeak = /service_role/.test(clientText.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ""));
  const fnDir = join(ROOT, "supabase/functions");
  const fnFiles = walk(fnDir).filter((f) => /\.ts$/.test(f));
  const fnText = fnFiles.map((f) => readFileSync(f, "utf8")).join("\n");
  return ratio([
    ["service_role token or reference in client code", !serviceRoleLeak],
    ["no service-role usage in client code", !/SERVICE_ROLE/.test(clientText)],
    ["edge functions lack rate limiting", /rate.?limit/i.test(fnText)],
    ["no SSRF allowlist on URL-fetching functions", /allowlist|allowedHosts|trusted_hosts|isPrivateHost/i.test(fnText)],
    ["no auth check in edge functions", /getUser\(|authorization/i.test(fnText)],
    ["no security regression tests", TESTS.some((f) => /security|xss|bypass/i.test(rel(f)))],
  ]);
});

track("Perf exam-ready", 1.1, () => {
  const text = CODE.map(read).join("\n");
  return ratio([
    ["no bundle-size budget script", existsSync(join(ROOT, "scripts/check-bundle-size.mjs"))],
    ["budget not wired into postbuild", /check-bundle-size/.test(readFileSync(join(ROOT, "package.json"), "utf8"))],
    ["no lazy route splitting", /lazyWithRetry\(|React\.lazy\(/.test(text)],
    ["no React Query staleTime on catalog reads", /staleTime/.test(text)],
    ["no image lazy loading", /loading=("|\{")lazy/.test(text)],
    ["no perf measurement script", existsSync(join(ROOT, "scripts/measure-perf.ts"))],
  ]);
});

track("Sentry triage", 0.8, () => {
  const text = CODE.map(read).join("\n");
  return ratio([
    ["no central error reporter", existsSync(join(SRC, "lib/sentry.ts")) || existsSync(join(SRC, "lib/reportError.ts"))],
    ["window.onerror not wired", /addEventListener\(\s*["']error["']/.test(text)],
    ["unhandledrejection not wired", /unhandledrejection/.test(text)],
    ["errors not persisted for trend analysis", /error_logs|captureException|addBreadcrumb/.test(text)],
    ["no error-report smoke script", existsSync(join(ROOT, "scripts/sentry-smoke.ts"))],
  ]);
});

/* -------------------------------- scoring ------------------------------- */

const totalWeight = tracks.reduce((s, t) => s + t.weight, 0);
const weighted = tracks.reduce((s, t) => s + t.score * t.weight, 0) / totalWeight;
const elo = Math.round(800 + (weighted / 100) * 1600);
const grade = elo >= 2200 ? "Master" : elo >= 2000 ? "Expert" : elo >= 1800 ? "Strong" : elo >= 1600 ? "Solid" : "Needs work";

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ elo, grade, average: Math.round(weighted), tracks }, null, 2));
} else {
  console.log("\nQuality ELO — Safar English (Capacitor)\n");
  for (const t of [...tracks].sort((a, b) => a.score - b.score)) {
    const bar = "█".repeat(Math.round(t.score / 5)).padEnd(20, "·");
    console.log(`${String(t.score).padStart(3)}  ${bar}  ${t.name} (w${t.weight})`);
    for (const f of t.failures) console.log(`        - ${f}`);
  }
  console.log(`\nComposite ELO: ${elo} / 2400  (${grade})`);
  console.log(`Weighted average track score: ${Math.round(weighted)}/100\n`);
}

const FLOOR = Number(process.env.ELO_FLOOR || 0);
if (FLOOR && elo < FLOOR) {
  console.error(`❌ quality-elo: ${elo} is below the floor of ${FLOOR}.`);
  process.exit(1);
}
