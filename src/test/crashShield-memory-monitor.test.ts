import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The heap poller used to run forever, once per install, even in a hidden
// WebView — a wakeup drain on low-end Android and a double-poller after HMR.
// These are source-level guards because the monitor installs itself at module
// load and cannot be re-created inside a single test process.
const src = readFileSync(resolve(__dirname, "../lib/crashShield.ts"), "utf8");

describe("crashShield memory monitor", () => {
  it("keeps a handle on the interval so it can be cleared", () => {
    expect(src).toMatch(/memoryMonitorTimer\s*=\s*setInterval\(/);
    expect(src).toMatch(/clearInterval\(memoryMonitorTimer\)/);
  });

  it("is idempotent — a second install does not stack a second poller", () => {
    expect(src).toMatch(/if\s*\(memoryMonitorTimer\s*!=\s*null\)\s*return;/);
  });

  it("skips polling while the WebView is hidden", () => {
    expect(src).toMatch(/document\.hidden\)\s*return;/);
  });

  it("exports a teardown hook", () => {
    expect(src).toMatch(/export function stopMemoryMonitor/);
  });
});
