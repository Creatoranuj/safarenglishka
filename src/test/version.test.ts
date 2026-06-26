import { describe, it, expect } from "vitest";
import { isUpdateRequired } from "@/utils/version";

describe("isUpdateRequired", () => {
  it("returns true when current is older (numeric, not lexical)", () => {
    expect(isUpdateRequired("1.9.0", "1.10.0")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isUpdateRequired("1.10.0", "1.10.0")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isUpdateRequired("2.0.0", "1.99.9")).toBe(false);
  });

  it("treats missing segments as zero", () => {
    expect(isUpdateRequired("1.0", "1.0.0")).toBe(false);
  });

  it("treats empty current as 0.0.0 (update required)", () => {
    expect(isUpdateRequired("", "1.0.0")).toBe(true);
  });

  it("treats empty min as 0.0.0 (no update)", () => {
    expect(isUpdateRequired("1.0.0", "")).toBe(false);
  });
});