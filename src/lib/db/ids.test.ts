import { describe, it, expect, vi, afterEach } from "vitest";
import { newId } from "./ids";

const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.useRealTimers();
});

describe("newId", () => {
  it("produces a well-formed UUIDv7: version 7, RFC 4122 variant", () => {
    for (let i = 0; i < 100; i++) {
      expect(newId()).toMatch(UUID_V7_RE);
    }
  });

  it("embeds the current Unix ms timestamp in the first 48 bits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));

    const id = newId();
    const tsHex = id.slice(0, 8) + id.slice(9, 13);
    expect(parseInt(tsHex, 16)).toBe(Date.now());
  });

  it("sorts after an id generated at an earlier millisecond", () => {
    // Time-ordering is the point of v7 — a regression to random layout
    // would still match the format regex but fail this.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    const earlier = newId();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.001Z"));
    const later = newId();

    expect(later > earlier).toBe(true);
  });

  it("does not collide across a burst of generations", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId()));
    expect(ids.size).toBe(10_000);
  });
});
