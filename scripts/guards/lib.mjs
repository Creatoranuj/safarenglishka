#!/usr/bin/env node
/**
 * Shared helpers for the skill guards.
 *
 * A "guard" is a cheap, grep-shaped check that encodes one rule from one of
 * the review skills we keep re-applying by hand. Each guard has a *budget*:
 * the count that existed when the guard was written. Going above the budget
 * fails (blocking guards) or warns (advisory guards). Cleanup PRs ratchet the
 * budget down; nothing ratchets it up silently.
 */
import { spawnSync } from "node:child_process";

/** Run ripgrep and return matching lines. Exit 1 from rg = "no matches". */
export function rg(pattern, paths, extraArgs = []) {
  const args = [
    "--no-heading",
    "-n",
    ...extraArgs,
    pattern,
    ...(Array.isArray(paths) ? paths : [paths]),
  ];
  const r = spawnSync("rg", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 1) {
    throw new Error(`rg failed (${r.status}): ${r.stderr}`);
  }
  return (r.stdout || "").split("\n").filter(Boolean);
}

/** Standard exclusions: tests, generated code, vendored shadcn primitives. */
export const SRC_EXCLUDES = [
  "-g",
  "!**/*.test.*",
  "-g",
  "!**/*.spec.*",
  "-g",
  "!src/test/**",
  "-g",
  "!src/components/ui/**",
];

export function withoutAllowlist(lines, allowlist) {
  return lines.filter((ln) => !allowlist.some((p) => ln.startsWith(`${p}:`)));
}

/**
 * Build a guard definition.
 *
 * mode: "block" — regression fails CI.
 *       "warn"  — regression is reported in the job summary only.
 */
export function guard({ id, skill, mode, budget, why, run }) {
  return { id, skill, mode, budget, why, run };
}

export function result(count, samples = []) {
  return { count, samples: samples.slice(0, 5) };
}
