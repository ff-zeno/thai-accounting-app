import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the database layer
// ---------------------------------------------------------------------------

let selectCallCount = 0;
const selectResults: unknown[][] = [];

const insertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([{ id: "vat-1" }]),
};

const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([{ id: "vat-1" }]),
};

const mockInsert = vi.fn().mockReturnValue(insertChain);
const mockUpdate = vi.fn().mockReturnValue(updateChain);

// Build a chain object where every method returns 'this' except terminal
// methods that return the result. This handles any depth of chaining.
function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === "then") {
        // Make the chain thenable so `await` resolves to `result`
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      if (prop === Symbol.iterator) {
        return () => result[Symbol.iterator]();
      }
      // Any method call returns the same proxy (chainable)
      return vi.fn().mockReturnValue(self);
    },
  });
  return self;
}

const mockSelect = vi.fn().mockImplementation(() => {
  const idx = selectCallCount++;
  const result = selectResults[idx] ?? [];
  return makeChain(result);
});

vi.mock("../index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

// Mock audit-log to prevent side effects
vi.mock("../helpers/audit-log", () => ({
  auditMutation: vi.fn().mockResolvedValue(undefined),
}));

const {
  computeVatForPeriod,
  checkNilFiling,
  computePp30Deadline,
  computePp36Deadline,
} = await import("./vat-records");

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  selectResults.length = 0;
  insertChain.values.mockReturnThis();
  insertChain.onConflictDoUpdate.mockReturnThis();
  insertChain.returning.mockResolvedValue([{ id: "vat-1" }]);
  updateChain.set.mockReturnThis();
  updateChain.where.mockReturnThis();
  updateChain.returning.mockResolvedValue([{ id: "vat-1" }]);
});

// ---------------------------------------------------------------------------
// CRITICAL COMPLIANCE TEST: Net VAT excludes PP 36
// ---------------------------------------------------------------------------

describe("computeVatForPeriod", () => {
  it("net_vat_payable excludes PP 36 reverse charge (CRITICAL)", async () => {
    // Output VAT (income invoices): 10000.00
    selectResults[0] = [{ total: "10000.00" }];
    // Output credit notes: 0
    selectResults[1] = [{ total: "0.00" }];
    // Input VAT PP 30 (domestic expenses): 3000.00
    selectResults[2] = [{ total: "3000.00" }];
    // Input credit notes: 0
    selectResults[3] = [{ total: "0.00" }];
    // PP 36 reverse charge (foreign expenses): 2000.00
    selectResults[4] = [{ total: "2000.00" }];

    const result = await computeVatForPeriod("org-1", 2026, 3);

    expect(result.outputVat).toBe("10000.00");
    expect(result.inputVatPp30).toBe("3000.00");
    expect(result.pp36ReverseCharge).toBe("2000.00");

    // CRITICAL: net = output - input = 10000 - 3000 = 7000
    // PP 36 (2000) must NOT be subtracted from net
    expect(result.netVatPayable).toBe("7000.00");
    // Explicitly verify it is NOT 5000 (which would be wrong: 10000 - 3000 - 2000)
    expect(result.netVatPayable).not.toBe("5000.00");
  });

  it("handles zero VAT correctly", async () => {
    selectResults[0] = [{ total: "0.00" }]; // output
    selectResults[1] = [{ total: "0.00" }]; // output CN
    selectResults[2] = [{ total: "0.00" }]; // input
    selectResults[3] = [{ total: "0.00" }]; // input CN
    selectResults[4] = [{ total: "0.00" }]; // PP 36

    const result = await computeVatForPeriod("org-1", 2026, 1);

    expect(result.outputVat).toBe("0.00");
    expect(result.inputVatPp30).toBe("0.00");
    expect(result.pp36ReverseCharge).toBe("0.00");
    expect(result.netVatPayable).toBe("0.00");
  });

  it("negative net VAT when input exceeds output (VAT credit)", async () => {
    selectResults[0] = [{ total: "5000.00" }]; // output
    selectResults[1] = [{ total: "0.00" }]; // output CN
    selectResults[2] = [{ total: "8000.00" }]; // input
    selectResults[3] = [{ total: "0.00" }]; // input CN
    selectResults[4] = [{ total: "0.00" }]; // PP 36

    const result = await computeVatForPeriod("org-1", 2026, 6);

    expect(result.netVatPayable).toBe("-3000.00");
  });

  it("credit note reduces parent output VAT", async () => {
    // Output VAT from invoices: 700
    selectResults[0] = [{ total: "700.00" }];
    // Output credit note VAT: 100 (reduces output)
    selectResults[1] = [{ total: "100.00" }];
    // Input: 0
    selectResults[2] = [{ total: "0.00" }];
    // Input CN: 0
    selectResults[3] = [{ total: "0.00" }];
    // PP 36: 0
    selectResults[4] = [{ total: "0.00" }];

    const result = await computeVatForPeriod("org-1", 2026, 4);

    // Net output = 700 - 100 = 600
    expect(result.outputVat).toBe("600.00");
    expect(result.netVatPayable).toBe("600.00");
  });

  it("credit note reduces parent input VAT", async () => {
    // Output: 1000
    selectResults[0] = [{ total: "1000.00" }];
    // Output CN: 0
    selectResults[1] = [{ total: "0.00" }];
    // Input from invoices: 500
    selectResults[2] = [{ total: "500.00" }];
    // Input credit note: 50
    selectResults[3] = [{ total: "50.00" }];
    // PP 36: 0
    selectResults[4] = [{ total: "0.00" }];

    const result = await computeVatForPeriod("org-1", 2026, 5);

    // Net input = 500 - 50 = 450
    expect(result.inputVatPp30).toBe("450.00");
    // Net VAT = 1000 - 450 = 550
    expect(result.netVatPayable).toBe("550.00");
  });

  it("PP 36 tracked separately even with large amounts", async () => {
    selectResults[0] = [{ total: "100000.00" }]; // output
    selectResults[1] = [{ total: "0.00" }]; // output CN
    selectResults[2] = [{ total: "50000.00" }]; // input
    selectResults[3] = [{ total: "0.00" }]; // input CN
    selectResults[4] = [{ total: "35000.00" }]; // PP 36

    const result = await computeVatForPeriod("org-1", 2026, 7);

    expect(result.pp36ReverseCharge).toBe("35000.00");
    // net = 100000 - 50000 = 50000 (NOT 15000)
    expect(result.netVatPayable).toBe("50000.00");
  });
});

// ---------------------------------------------------------------------------
// Nil filing
// ---------------------------------------------------------------------------

describe("checkNilFiling", () => {
  it("returns true when both output and input are zero", async () => {
    selectResults[0] = [{ total: "0.00" }]; // output
    selectResults[1] = [{ total: "0.00" }]; // output CN
    selectResults[2] = [{ total: "0.00" }]; // input
    selectResults[3] = [{ total: "0.00" }]; // input CN
    selectResults[4] = [{ total: "0.00" }]; // PP 36

    const isNil = await checkNilFiling("org-1", 2026, 2);
    expect(isNil).toBe(true);
  });

  it("returns false when there is output VAT", async () => {
    selectResults[0] = [{ total: "500.00" }]; // output
    selectResults[1] = [{ total: "0.00" }]; // output CN
    selectResults[2] = [{ total: "0.00" }]; // input
    selectResults[3] = [{ total: "0.00" }]; // input CN
    selectResults[4] = [{ total: "0.00" }]; // PP 36

    const isNil = await checkNilFiling("org-1", 2026, 2);
    expect(isNil).toBe(false);
  });

  it("returns false when there is input VAT", async () => {
    selectResults[0] = [{ total: "0.00" }]; // output
    selectResults[1] = [{ total: "0.00" }]; // output CN
    selectResults[2] = [{ total: "300.00" }]; // input
    selectResults[3] = [{ total: "0.00" }]; // input CN
    selectResults[4] = [{ total: "0.00" }]; // PP 36

    const isNil = await checkNilFiling("org-1", 2026, 2);
    expect(isNil).toBe(false);
  });

  it("returns true even with PP 36 activity (nil is about PP 30 only)", async () => {
    // PP 36 has activity but PP 30 output/input are zero
    selectResults[0] = [{ total: "0.00" }]; // output
    selectResults[1] = [{ total: "0.00" }]; // output CN
    selectResults[2] = [{ total: "0.00" }]; // input
    selectResults[3] = [{ total: "0.00" }]; // input CN
    selectResults[4] = [{ total: "1500.00" }]; // PP 36

    const isNil = await checkNilFiling("org-1", 2026, 2);
    expect(isNil).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Deadline computation
// ---------------------------------------------------------------------------

describe("deadline computation", () => {
  it("PP 30 deadline is 23rd of following month", () => {
    const deadline = computePp30Deadline(2026, 1);
    // 23rd Feb 2026 in +07:00 = Feb 22 17:00 UTC
    expect(deadline).toContain("2026-02");
  });

  it("PP 36 deadline is 15th of following month", () => {
    const deadline = computePp36Deadline(2026, 1);
    // 15th Feb 2026 in +07:00 = Feb 14 17:00 UTC
    expect(deadline).toContain("2026-02");
  });

  it("PP 30 and PP 36 have different deadlines", () => {
    const pp30 = computePp30Deadline(2026, 3);
    const pp36 = computePp36Deadline(2026, 3);
    expect(pp30).not.toBe(pp36);
  });

  it("handles year boundary: period December rolls to January", () => {
    const pp30 = computePp30Deadline(2026, 12);
    expect(pp30).toContain("2027-01");

    const pp36 = computePp36Deadline(2026, 12);
    expect(pp36).toContain("2027-01");
  });
});
