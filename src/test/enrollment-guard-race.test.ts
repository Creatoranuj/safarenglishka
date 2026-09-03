import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for the "You're already enrolled" bounce loop.
 *
 * LectureListing hydrates from a warm in-memory `chapterCache`, which sets
 * `loading = false` on the very first render while `hasPurchased` is still its
 * initial `false`. Gating the enrollment redirect on `loading` therefore fired
 * before the enrollment query resolved and kicked enrolled students out to
 * /buy-course, which bounced them back with an "already enrolled" toast.
 *
 * The guard must be gated on the fresh network answer (`accessResolved`),
 * never on `loading`. LessonView already does this; these assertions keep all
 * three surfaces from regressing.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const guardBlock = (src: string, marker: string) => {
  const idx = src.indexOf(marker);
  expect(idx, `marker not found: ${marker}`).toBeGreaterThan(-1);
  return src.slice(idx, idx + 1000);
};

describe("enrollment guard cannot fire before the fresh access answer", () => {
  it("LectureListing gates the redirect on accessResolved, not loading", () => {
    const src = read("src/pages/LectureListing.tsx");
    expect(src).toContain("const [accessResolved, setAccessResolved] = useState(false)");
    expect(src).toContain("setAccessResolved(true)");

    const block = guardBlock(src, "// Enrollment guard: redirect unenrolled non-admin users");
    expect(block).toContain("if (!accessResolved");
    expect(block).not.toMatch(/if \(loading \|\|/);
  });

  it("LessonView keeps its accessResolved gate", () => {
    const src = read("src/pages/LessonView.tsx");
    const block = guardBlock(src, "// Enrollment guard: redirect unenrolled non-admin users");
    expect(block).toContain("accessResolved");
  });

  it("ChapterView's guard does its own fresh query and is not gated on loading", () => {
    const src = read("src/pages/ChapterView.tsx");
    const block = guardBlock(src, "// Enrollment guard: redirect unenrolled non-admin users");
    expect(block).not.toMatch(/if \(loading \|\|/);
    expect(block).toContain('.eq("status", "active")');
  });
});
