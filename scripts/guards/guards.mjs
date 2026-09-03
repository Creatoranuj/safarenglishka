#!/usr/bin/env node
/**
 * Skill guards — one entry per review skill we used to apply by hand.
 *
 * The point is not to re-implement a linter. Each guard encodes the one rule
 * from that skill that actually regressed in this repo before, in the cheapest
 * way that still catches it on a PR. Budgets are today's snapshot; they only
 * ever move down.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { rg, SRC_EXCLUDES, withoutAllowlist, guard, result } from "./lib.mjs";

const readIf = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push({ path: full, size: st.size });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 1. app-crash-shield                                                 */
/* ------------------------------------------------------------------ */
const crashCleanup = guard({
  id: "crash-cleanup",
  skill: "app-crash-shield",
  mode: "block",
  budget: 13, // snapshot 2026-09-03
  why: "A file that opens more timers/listeners than it cleans leaks across navigations — that is what kills low-RAM Android sessions.",
  run() {
    const files = new Set(
      rg(String.raw`\b(setInterval|addEventListener)\s*\(`, ["src/"], SRC_EXCLUDES).map(
        (l) => l.split(":")[0],
      ),
    );
    const leaky = [];
    for (const f of files) {
      const src = readIf(f);
      const opens =
        (src.match(/\bsetInterval\s*\(/g) || []).length +
        (src.match(/\baddEventListener\s*\(/g) || []).length;
      const closes =
        (src.match(/\bclearInterval\s*\(/g) || []).length +
        (src.match(/\bremoveEventListener\s*\(/g) || []).length;
      if (opens > closes) leaky.push(`${f} (${opens} open / ${closes} cleaned)`);
    }
    return result(leaky.length, leaky);
  },
});

const emptyCatch = guard({
  id: "empty-catch",
  skill: "app-crash-shield",
  mode: "warn",
  budget: 42, // snapshot 2026-09-03
  why: "An empty catch hides the failure from the user and from Sentry. Best-effort native calls are the only fair use.",
  run() {
    const hits = rg(
      String.raw`catch\s*(\([^)]*\))?\s*\{\s*\}`,
      ["src/"],
      [...SRC_EXCLUDES, "-U"],
    );
    return result(hits.length, hits);
  },
});

/* ------------------------------------------------------------------ */
/* 2. asset-optimization                                               */
/* ------------------------------------------------------------------ */
const OVERSIZE_LIMIT = 200 * 1024;
const ASSET_ALLOW = [
  // PWA icons and the OG preview must stay PNG (stores + social scrapers).
  "public/icons/icon-512.png",
  "public/icons/icon-192.png",
];
const assetSize = guard({
  id: "asset-size",
  skill: "asset-optimization",
  mode: "block",
  budget: 0,
  why: "Every install-time asset over 200 KB is payload a student on 3G pays for before the first frame.",
  run() {
    const exts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
    const big = [...walk("public"), ...walk("src/assets")]
      .filter((f) => exts.has(extname(f.path).toLowerCase()))
      .filter((f) => f.size > OVERSIZE_LIMIT)
      .filter((f) => !ASSET_ALLOW.includes(f.path))
      .map((f) => `${f.path} (${Math.round(f.size / 1024)} KB)`);
    return result(big.length, big);
  },
});

/* ------------------------------------------------------------------ */
/* 3. capacitor-back-button                                            */
/* ------------------------------------------------------------------ */
const backButton = guard({
  id: "back-button",
  skill: "capacitor-back-button",
  mode: "block",
  budget: 1,
  why: "Two backButton listeners = first press exits the app. This is the exact bug the module-level guard exists to prevent.",
  run() {
    const hits = rg(String.raw`addListener\(\s*["'\`]backButton`, ["src/"], SRC_EXCLUDES);
    return result(hits.length, hits);
  },
});

/* ------------------------------------------------------------------ */
/* 4. capacitor-video-player-master                                    */
/* ------------------------------------------------------------------ */
const playerChrome = guard({
  id: "player-chrome",
  skill: "capacitor-video-player-master",
  mode: "warn",
  budget: 2, // snapshot 2026-09-03
  why: "Extra transforms on the player chrome break the rotation-aware auto-hide gesture math.",
  run() {
    const hits = rg(
      String.raw`(scale-|translate-|rotate-)\[`,
      ["src/components/video/"],
      SRC_EXCLUDES,
    );
    return result(hits.length, hits);
  },
});

/* ------------------------------------------------------------------ */
/* 5. console-error-triage                                             */
/* ------------------------------------------------------------------ */
const CONSOLE_ALLOW = [
  "src/lib/log.ts",
  "src/lib/nativeDebug.ts",
  "src/lib/reportError.ts",
  "src/lib/sentry.ts",
];
const consoleError = guard({
  id: "console-error",
  skill: "console-error-triage",
  mode: "block",
  budget: 8, // snapshot 2026-09-03
  why: "Every console.error is forwarded to Sentry in production — a noisy console is literally paid-for noise.",
  run() {
    const hits = withoutAllowlist(
      rg(String.raw`console\.error\s*\(`, ["src/"], SRC_EXCLUDES),
      CONSOLE_ALLOW,
    );
    return result(hits.length, hits);
  },
});

/* ------------------------------------------------------------------ */
/* 6. mobile-view-expert                                               */
/* ------------------------------------------------------------------ */
const mobileView = guard({
  id: "mobile-view",
  skill: "mobile-view-expert",
  mode: "warn",
  budget: 2, // snapshot 2026-09-03
  why: "text-sm on an input makes iOS zoom on focus; a fixed bottom bar without safe-area sits under the home indicator.",
  run() {
    const smallInputs = rg(
      String.raw`<(input|textarea)[^>]*text-sm`,
      ["src/"],
      [...SRC_EXCLUDES, "-U"],
    );
    const fixedFiles = new Set(
      rg(String.raw`fixed[^"'\`]*bottom-0`, ["src/"], SRC_EXCLUDES).map((l) => l.split(":")[0]),
    );
    const unsafe = [...fixedFiles].filter((f) => !readIf(f).includes("safe-area-inset"));
    return result(smallInputs.length + unsafe.length, [
      ...smallInputs,
      ...unsafe.map((f) => `${f}: fixed bottom-0 without safe-area-inset`),
    ]);
  },
});

/* ------------------------------------------------------------------ */
/* 7. senior-architect-audit                                           */
/* ------------------------------------------------------------------ */
const archPolish = guard({
  id: "arch-polish",
  skill: "senior-architect-audit",
  mode: "warn",
  budget: 51, // snapshot 2026-09-03
  why: "Arbitrary Tailwind values and key={index} are the two tells that a surface drifted off the design system.",
  run() {
    const arbitrary = rg(
      String.raw`(duration|p|px|py|rounded|gap)-\[\d`,
      ["src/"],
      SRC_EXCLUDES,
    );
    const keyIndex = rg(String.raw`key=\{\s*(index|i)\s*\}`, ["src/"], SRC_EXCLUDES);
    return result(arbitrary.length + keyIndex.length, [...arbitrary, ...keyIndex]);
  },
});

/* ------------------------------------------------------------------ */
/* 8. soft-touch                                                       */
/* ------------------------------------------------------------------ */
const softTouch = guard({
  id: "soft-touch",
  skill: "soft-touch",
  mode: "warn",
  budget: 0,
  why: "Haptics must go through @/lib/native/haptics — the wrapper is what keeps the plugin out of the web bundle.",
  run() {
    const hits = withoutAllowlist(
      rg(String.raw`from\s+["']@capacitor/haptics["']`, ["src/"], SRC_EXCLUDES),
      ["src/lib/native/haptics.ts"],
    );
    return result(hits.length, hits);
  },
});

/* ------------------------------------------------------------------ */
/* 9. supabase-architect-auditor                                       */
/* ------------------------------------------------------------------ */
const supabaseRls = guard({
  id: "supabase-rls",
  skill: "supabase-architect-auditor",
  mode: "block",
  budget: 0,
  why: "A public table without GRANT+RLS in the same migration is either unreachable or wide open. Both are bugs.",
  run() {
    const dir = "supabase/migrations";
    if (!existsSync(dir)) return result(0);
    // Historical migrations are frozen history — they cannot be retro-edited.
    // The guard holds the line from the day it was introduced forward.
    const CUTOFF = "20260903";
    const offenders = [];
    const legacy = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
      const isNew = f.slice(0, 8) >= CUTOFF;
      const full = join(dir, f);
      const sql = readFileSync(full, "utf8");
      const lower = sql.toLowerCase();
      const bucket = isNew ? offenders : legacy;
      const createsPublicTable = /create\s+table\s+(if\s+not\s+exists\s+)?(public\.)?[a-z_]/i.test(sql);
      if (createsPublicTable) {
        if (!lower.includes("grant ")) bucket.push(`${full}: CREATE TABLE without GRANT`);
        else if (!lower.includes("enable row level security"))
          bucket.push(`${full}: CREATE TABLE without ENABLE ROW LEVEL SECURITY`);
      }
      // SECURITY DEFINER without a pinned search_path is a privilege-escalation path.
      const defs = lower.split("security definer").length - 1;
      const paths = lower.split("set search_path").length - 1;
      if (defs > paths) bucket.push(`${full}: SECURITY DEFINER without SET search_path`);
    }
    return result(offenders.length, [
      ...offenders,
      `(${legacy.length} pre-${CUTOFF} migrations not enforced — frozen history)`,
    ]);
  },
});

/* ------------------------------------------------------------------ */
/* 10. red-team-security-audit                                         */
/* ------------------------------------------------------------------ */
const SECRET_PATTERNS = String.raw`(eyJhbGciOi[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9]{10,}|rzp_live_[A-Za-z0-9]{10,}|sbp_[a-f0-9]{20,}|service_role["'\s:=]+eyJ)`;
const redTeam = guard({
  id: "secrets-and-webview",
  skill: "red-team-security-audit",
  mode: "block",
  budget: 0,
  why: "A privileged key or a debuggable release WebView is a full compromise, not a code-style nit.",
  run() {
    const raw = rg(SECRET_PATTERNS, ["src/", "public/", "capacitor.config.ts", "index.html"], [
      "-g",
      "!**/*.map",
    ]);
    // A Supabase *publishable* (anon) key is meant to ship in the client.
    // Only a privileged key is a leak, so decode the JWT and look at the role.
    const leaks = raw.filter((line) => {
      const jwt = line.match(/eyJhbGciOi[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\./);
      if (!jwt) return true;
      try {
        const payload = JSON.parse(Buffer.from(jwt[1], "base64").toString("utf8"));
        return payload.role !== "anon";
      } catch {
        return true;
      }
    });
    const cfg = readIf("capacitor.config.ts");
    const unsafeCfg = [];
    // Only flag unconditional true — a dev-gated ternary is correct.
    if (/webContentsDebuggingEnabled:\s*true\b/.test(cfg))
      unsafeCfg.push("capacitor.config.ts: webContentsDebuggingEnabled hardcoded true");
    if (/cleartext:\s*true\b/.test(cfg))
      unsafeCfg.push("capacitor.config.ts: cleartext hardcoded true");
    return result(leaks.length + unsafeCfg.length, [...leaks, ...unsafeCfg]);
  },
});

/* ------------------------------------------------------------------ */
/* 11. perf-exam-ready                                                 */
/* ------------------------------------------------------------------ */
const perfBudget = guard({
  id: "perf-budget",
  skill: "perf-exam-ready",
  mode: "block",
  budget: 0,
  why: "Exam week is when the slowest phone on the worst network opens the app. The bundle budget is the promise.",
  run() {
    // Delegates to the existing bundle-size script; it owns the real numbers.
    if (!existsSync("dist"))
      return result(0, ["dist/ not built — skipped (the build job enforces this)"]);
    const r = spawnSync("node", ["scripts/check-bundle-size.mjs"], { encoding: "utf8" });
    return result(r.status === 0 ? 0 : 1, [`${r.stdout || ""}${r.stderr || ""}`].filter(Boolean));
  },
});

/* ------------------------------------------------------------------ */
/* 12. sentry-triage                                                   */
/* ------------------------------------------------------------------ */
const sentryContext = guard({
  id: "sentry-context",
  skill: "sentry-triage",
  mode: "warn",
  budget: 229, // snapshot 2026-09-03
  why: "reportError without a `surface` produces a Sentry issue nobody can route to an owner.",
  run() {
    const calls = rg(String.raw`reportError\s*\(`, ["src/"], [...SRC_EXCLUDES, "-U", "-A", "2"]);
    const missing = calls.filter((line) => !/surface/.test(line)).map((l) => l.split("\n")[0]);
    return result(missing.length, missing);
  },
});

export const GUARDS = [
  crashCleanup,
  emptyCatch,
  assetSize,
  backButton,
  playerChrome,
  consoleError,
  mobileView,
  archPolish,
  softTouch,
  supabaseRls,
  redTeam,
  perfBudget,
  sentryContext,
];
