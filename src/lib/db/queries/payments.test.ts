import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the database layer
// ---------------------------------------------------------------------------

// Track call count to distinguish between sequential db.select() calls
let selectCallCount = 0;
const selectResults: unknown[][] = [];

const insertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([{ id: "pay-1" }]),
};

const mockInsert = vi.fn().mockReturnValue(insertChain);

function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      if (prop === Symbol.iterator) {
        return () => result[Symbol.iterator]();
      }
      return vi.fn().mockReturnValue(self);
    },
  });
  return self;
}

// Each db.select() call creates a fresh chain that resolves to the next result
const mockSelect = vi.fn().mockImplementation(() => {
  const idx = selectCallCount++;
  const result = selectResults[idx] ?? [];
  return makeChain(result);
});

vi.mock("../index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

const { createPayment, getDocumentPaymentSummary } = await import("./payments");

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  selectResults.length = 0;
  insertChain.values.mockReturnThis();
  insertChain.returning.mockResolvedValue([{ id: "pay-1" }]);
});

// ---------------------------------------------------------------------------
// createPayment
// ---------------------------------------------------------------------------

describe("createPayment", () => {
  it("creates payment and returns paymentId", async () => {
    insertChain.returning.mockResolvedValue([{ id: "pay-abc" }]);

    const result = await createPayment({
      orgId: "org-1",
      documentId: "doc-1",
      paymentDate: "2026-03-15",
      grossAmount: "10000.00",
      whtAmountWithheld: "300.00",
      netAmountPaid: "9700.00",
    });

    expect(result.paymentId).toBe("pay-abc");

    const insertedValues = insertChain.values.mock.calls[0][0];
    expect(insertedValues.orgId).toBe("org-1");
    expect(insertedValues.documentId).toBe("doc-1");
    expect(insertedValues.grossAmount).toBe("10000.00");
    expect(insertedValues.whtAmountWithheld).toBe("300.00");
    expect(insertedValues.netAmountPaid).toBe("9700.00");
    expect(insertedValues.paymentMethod).toBe("bank_transfer");
  });

  it("uses provided payment method", async () => {
    insertChain.returning.mockResolvedValue([{ id: "pay-xyz" }]);

    await createPayment({
      orgId: "org-1",
      documentId: "doc-1",
      paymentDate: "2026-03-15",
      grossAmount: "5000.00",
      whtAmountWithheld: "0.00",
      netAmountPaid: "5000.00",
      paymentMethod: "promptpay",
    });

    const insertedValues = insertChain.values.mock.calls[0][0];
    expect(insertedValues.paymentMethod).toBe("promptpay");
  });
});

// ---------------------------------------------------------------------------
// getDocumentPaymentSummary
// ---------------------------------------------------------------------------

describe("getDocumentPaymentSummary", () => {
  it("returns correct totals for one payment", async () => {
    // First db.select() → payment aggregation
    selectResults[0] = [{ totalPaid: "9700.00", paymentCount: 1 }];
    // Second db.select() → document total
    selectResults[1] = [{ totalAmount: "10000.00" }];

    const summary = await getDocumentPaymentSummary("org-1", "doc-1");

    expect(summary.totalPaid).toBe("9700.00");
    expect(summary.balanceDue).toBe("300.00");
    expect(summary.paymentCount).toBe(1);
  });

  it("returns zero totals when no payments exist", async () => {
    selectResults[0] = [{ totalPaid: "0.00", paymentCount: 0 }];
    selectResults[1] = [{ totalAmount: "15000.00" }];

    const summary = await getDocumentPaymentSummary("org-1", "doc-1");

    expect(summary.totalPaid).toBe("0.00");
    expect(summary.balanceDue).toBe("15000.00");
    expect(summary.paymentCount).toBe(0);
  });

  it("returns zero balance when fully paid", async () => {
    selectResults[0] = [{ totalPaid: "8000.00", paymentCount: 2 }];
    selectResults[1] = [{ totalAmount: "8000.00" }];

    const summary = await getDocumentPaymentSummary("org-1", "doc-1");

    expect(summary.totalPaid).toBe("8000.00");
    expect(summary.balanceDue).toBe("0.00");
    expect(summary.paymentCount).toBe(2);
  });
});
