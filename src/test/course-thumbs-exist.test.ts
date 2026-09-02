/**
 * Asset-integrity guard.
 *
 * Why this exists: the course cards on /courses and /my-courses rendered a grey
 * placeholder for weeks because `courses.thumbnail_url` pointed at
 * `/course-thumbs/*.jpg`, which never existed in `public/`. The 404 came back as
 * HTML, SmartImage swallowed it, and nothing surfaced the breakage.
 *
 * Two mechanical rules keep that class of bug out:
 *   1. No Lovable `*.asset.json` pointer files in src/assets — they reference a
 *      foreign project id + a CDN path that 404s in this repo.
 *   2. Every root-absolute image path referenced from src/ must exist in public/.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");
const PUBLIC = join(ROOT, "public");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(SRC);
const CODE_RE = /\.(ts|tsx|js|jsx|css)$/;
// Paths used in tests/fixtures only ("/x.png") are not real assets.
const FIXTURE = /^\/x\.(png|webp|avif|jpe?g|svg)$/;
const IMG_RE = /["'`](\/[A-Za-z0-9._/-]+\.(?:png|jpe?g|svg|webp|avif))["'`]/g;

describe("asset integrity", () => {
  it("has no Lovable *.asset.json pointer files under src/", () => {
    const pointers = files
      .filter((f) => f.endsWith(".asset.json"))
      .map((f) => f.slice(ROOT.length + 1));
    expect(pointers).toEqual([]);
  });

  it("resolves every root-absolute image path referenced from src/", () => {
    const missing = new Set<string>();
    for (const file of files) {
      if (!CODE_RE.test(file)) continue;
      if (/[\\/]test[\\/]/.test(file) || /\.test\./.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(IMG_RE)) {
        const path = match[1];
        if (FIXTURE.test(path)) continue;
        if (path.startsWith("/__l5e/")) {
          missing.add(`${path} (dead Lovable CDN pointer)`);
          continue;
        }
        if (!existsSync(join(PUBLIC, path))) missing.add(path);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
