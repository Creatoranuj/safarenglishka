#!/usr/bin/env node
/**
 * Replit/Vite 8 guard: on some clean Linux builds Rolldown can emit a clean
 * vendor-react chunk that is still not minified. That makes the custom
 * bundle-size gate fail even though chunking is correct. Re-minify only that
 * broken chunk shape before the size check runs.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { transformSync } from "esbuild";

const ASSETS = join("dist", "assets");
const gz = (code) => gzipSync(Buffer.from(code)).length;
const fmt = (n) => `${(n / 1024).toFixed(1)}KB`;

if (!existsSync(ASSETS)) process.exit(0);

for (const name of readdirSync(ASSETS)) {
  if (!/^vendor-react-.*\.js$/.test(name)) continue;

  const file = join(ASSETS, name);
  const code = readFileSync(file, "utf8");
  const beforeRaw = Buffer.byteLength(code);
  const beforeGz = gz(code);

  // Healthy minified React vendor is ~44KB gzip / ~140KB raw. Replit's broken
  // output is ~95KB gzip / ~320KB raw. Avoid touching healthy builds.
  if (beforeGz <= 80 * 1024 || beforeRaw <= 250 * 1024) continue;

  const result = transformSync(code, {
    minify: true,
    format: "esm",
    target: "es2020",
    legalComments: "none",
  }).code;

  writeFileSync(file, result);
  console.log(
    `[postbuild-minify] ${name}: ${fmt(beforeGz)} gzip -> ${fmt(gz(result))} gzip`,
  );
}