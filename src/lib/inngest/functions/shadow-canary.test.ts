import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInngestHarness } from "@/tests/inngest-harness";

// Mock the entire db module with a chainable query builder
const mockQueryResult: unknown[] = [];
vi.mock("@/lib/db", () => {
  const createChain = () => {
    const chain = {
      select: vi.fn(() => chain),
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(mockQueryResult)),
      then: (resolve: (v: unknown) => void) => Promise.resolve(mockQueryResult).then(resolve),
      [Symbol.iterator]: function* () {
        yield* mockQueryResult;
      },
    };
    return chain;
  };
  return {
    db: {
      select: vi.fn(() => createChain()),
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
  extractionCompiledPatterns: {},
  vendorTier: {},
  extractionLog: {},
}));

vi.mock("@/lib/db/queries/compiled-patterns", () => ({
  retirePattern: vi.fn(),
}));

vi.mock("@/lib/db/queries/vendor-tier", () => ({
  demoteVendorTier: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  sql: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
}));

const { shadowCanary } = await import("./shadow-canary");

const harness = createInngestHarness();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shadowCanary", () => {
  it("short-circuits when no active patterns", async () => {
    const { result } = await harness.invoke(shadowCanary, { data: {} });
    expect(result).toEqual({ checked: 0, demoted: 0 });
  });
});
