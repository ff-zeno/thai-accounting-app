import { describe, it, expect } from "vitest";
import { toBuddhistYear, fromBuddhistYear } from "./thai-date";

describe("toBuddhistYear", () => {
  it("converts 2026 to 2569", () => {
    expect(toBuddhistYear(2026)).toBe(2569);
  });

  it("converts 2023 to 2566", () => {
    expect(toBuddhistYear(2023)).toBe(2566);
  });

  it("converts 2000 to 2543", () => {
    expect(toBuddhistYear(2000)).toBe(2543);
  });
});

describe("fromBuddhistYear", () => {
  it("converts 2569 to 2026", () => {
    expect(fromBuddhistYear(2569)).toBe(2026);
  });

  it("roundtrips correctly", () => {
    expect(fromBuddhistYear(toBuddhistYear(2026))).toBe(2026);
  });
});
