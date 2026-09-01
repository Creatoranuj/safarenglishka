import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for rollup's INEFFECTIVE_DYNAMIC_IMPORT warning.
 *
 * `src/lib/linkOfflineSave.ts` pulls in the download + filesystem stack. It is
 * imported dynamically from FolderView and AddFromLinkDialog so it stays out of
 * the library entry chunk. A single *static* import anywhere undoes that: rollup
 * then hoists the module into the importing chunk and prints
 *   "... is dynamically imported by X but also statically imported by Y,
 *    dynamic import will not move module into another chunk."
 *
 * If a new call site needs it, use `await import(...)`, not a top-level import.
 */
const LAZY_ONLY_MODULES = ["linkOfflineSave"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("lazy-only modules are never statically imported", () => {
  const files = walk(join(process.cwd(), "src"));

  for (const moduleName of LAZY_ONLY_MODULES) {
    it(`${moduleName} has no static import site`, () => {
      const offenders: string[] = [];

      for (const file of files) {
        const source = readFileSync(file, "utf8");
        if (!source.includes(moduleName)) continue;

        for (const line of source.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
          // Static ESM import: `import ... from ".../linkOfflineSave"`.
          // `await import("...")` and `import("...")` are fine.
          if (/^\s*import\s[^(]*from\s+["'][^"']*/.test(line) && line.includes(moduleName)) {
            offenders.push(`${file.replace(process.cwd() + "/", "")}: ${trimmed}`);
          }
        }
      }

      expect(offenders, `Use await import() instead:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});
