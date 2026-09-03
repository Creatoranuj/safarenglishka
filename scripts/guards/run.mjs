#!/usr/bin/env node
/**
 * Skill guard runner.
 *
 *   node scripts/guards/run.mjs              # everything, fails on a blocking regression
 *   node scripts/guards/run.mjs --mode block
 *   node scripts/guards/run.mjs --mode warn
 *   node scripts/guards/run.mjs --snapshot   # print current counts, never fail
 *
 * Writes a markdown table to $GITHUB_STEP_SUMMARY when running in Actions.
 */
import { appendFileSync } from "node:fs";
import { GUARDS } from "./guards.mjs";

const args = process.argv.slice(2);
const modeArg = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : null;
const snapshot = args.includes("--snapshot");

const selected = modeArg ? GUARDS.filter((g) => g.mode === modeArg) : GUARDS;

let failed = 0;
const rows = [];

for (const g of selected) {
  let count = 0;
  let samples = [];
  let error = null;
  try {
    ({ count, samples } = g.run());
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const budget = g.budget;
  const over = error ? true : budget !== null && count > budget;
  const status = error ? "💥 error" : over ? (g.mode === "block" ? "❌ over" : "⚠️ over") : "✅ ok";

  rows.push({
    id: g.id,
    skill: g.skill,
    mode: g.mode,
    count: error ? "-" : count,
    budget: budget === null ? "snapshot" : budget,
    status,
  });

  console.log(
    `${status}  ${g.id.padEnd(20)} ${String(count).padStart(4)} / ${
      budget === null ? "snapshot" : budget
    }   (${g.skill})`,
  );
  if (error) console.log(`      error: ${error}`);
  if (over && !error) {
    console.log(`      why: ${g.why}`);
    for (const s of samples) console.log(`      - ${s}`);
  }

  if (!snapshot && over && g.mode === "block") failed += 1;
}

const summary = process.env["GITHUB_STEP_SUMMARY"];
if (summary) {
  const md = [
    "| Guard | Skill | Mode | Count | Budget | Status |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...rows.map(
      (r) => `| \`${r.id}\` | ${r.skill} | ${r.mode} | ${r.count} | ${r.budget} | ${r.status} |`,
    ),
    "",
  ].join("\n");
  appendFileSync(summary, `### Skill guards\n\n${md}\n`);
}

if (failed > 0) {
  console.error(`\n${failed} blocking guard(s) over budget.`);
  process.exit(1);
}
console.log("\nAll selected guards within budget.");
