import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for the "header does not hide fully in landscape" bug.
 *
 * Two separate layers used to paint a strip across the physical top of the
 * screen while the reader chrome was hidden in landscape:
 *   1. the opaque notch band, rendered unconditionally OUTSIDE the rotation
 *      frame, and
 *   2. the header itself, hidden with a percentage translate that Android
 *      WebViews rounded down into a hairline.
 *
 * These assertions are source-level on purpose: the bug only reproduces with a
 * real safe-area inset and a rotated frame, neither of which jsdom models.
 */
const src = readFileSync(
  resolve(__dirname, "../components/library/DocReaderShell.tsx"),
  "utf8",
);

describe("DocReaderShell landscape header", () => {
  it("renders the notch band only in portrait while the chrome is visible", () => {
    expect(src).toContain("{headerVisible && !landscape && !pseudoLandscape && (");
    // The band must stay inside that conditional, not become always-on again.
    const guard = src.indexOf("{headerVisible && !landscape && !pseudoLandscape && (");
    const band = src.indexOf('data-testid="reader-notch-band"');
    expect(guard).toBeGreaterThan(-1);
    expect(band).toBeGreaterThan(guard);
  });

  it("moves the hidden header off-frame by measured pixels, not a percentage", () => {
    expect(src).not.toContain("-translate-y-full opacity-0 invisible");
    expect(src).toContain(
      "translateY(calc(-${headerHeight + 8}px - env(safe-area-inset-top, 0px)))",
    );
  });

  it("still fades and un-paints the hidden header", () => {
    expect(src).toContain('"opacity-0 invisible pointer-events-none"');
  });
});
