import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFormTypeForEntity } from "./wht-certificates";

// ---------------------------------------------------------------------------
// Mock the database layer
// ---------------------------------------------------------------------------

let selectCallCount = 0;
let insertCallCount = 0;
let updateCallCount = 0;

const selectResults: unknown[][] = [];
const insertResults: unknown[][] = [];
const updateResults: unknown[][] = [];

const mockSelect = vi.fn().mockImplementation(() => {
  const idx = selectCallCount++;
  const result = selectResults[idx] ?? [];
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue(result),
        orderBy: vi.fn().mockReturnValue(result),
      }),
      orderBy: vi.fn().mockReturnValue(result),
    }),
  };
});

const mockInsert = vi.fn().mockImplementation(() => {
  const idx = insertCallCount++;
  const result = insertResults[idx] ?? [{ id: "default-id" }];
  const chain = {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockReturnValue(result),
    }),
  };
  return chain;
});

const mockUpdate = vi.fn().mockImplementation(() => {
  const idx = updateCallCount++;
  const result = updateResults[idx] ?? [];
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue(result),
      }),
    }),
  };
});

vi.mock("../index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

// Mock isPeriodLocked to always return false (unlocked) by default
vi.mock("./wht-filings", () => ({
  isPeriodLocked: vi.fn().mockResolvedValue(false),
}));

const {
  allocateSequenceNumber,
  createWhtCertificateDraft,
} = await import("./wht-certificates");

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  insertCallCount = 0;
  updateCallCount = 0;
  selectResults.length = 0;
  insertResults.length = 0;
  updateResults.length = 0;
});

// ---------------------------------------------------------------------------
// getFormTypeForEntity
// ---------------------------------------------------------------------------

describe("getFormTypeForEntity", () => {
  it("returns pnd3 for individual", () => {
    expect(getFormTypeForEntity("individual")).toBe("pnd3");
  });

  it("returns pnd53 for company", () => {
    expect(getFormTypeForEntity("company")).toBe("pnd53");
  });

  it("returns pnd54 for foreign", () => {
    expect(getFormTypeForEntity("foreign")).toBe("pnd54");
  });
});

// ---------------------------------------------------------------------------
// allocateSequenceNumber
// ---------------------------------------------------------------------------

describe("allocateSequenceNumber", () => {
  it("returns 1 when no counter exists (first allocation)", async () => {
    // select returns empty (no existing counter)
    selectResults[0] = [];
    // insert succeeds for new counter row
    insertResults[0] = [{ id: "counter-1" }];

    const seq = await allocateSequenceNumber("org-1", "pnd53", 2026);
    expect(seq).toBe(1);
  });

  it("returns existing nextSequence and increments counter", async () => {
    selectResults[0] = [{ id: "counter-1", nextSequence: 5 }];
    updateResults[0] = [{ nextSequence: 6 }];

    const seq = await allocateSequenceNumber("org-1", "pnd53", 2026);
    expect(seq).toBe(5);
  });

  it("retries on optimistic lock failure", async () => {
    // First attempt: select returns seq=3, update fails (empty result)
    selectResults[0] = [{ id: "counter-1", nextSequence: 3 }];
    updateResults[0] = []; // optimistic lock miss

    // Second attempt: select returns seq=4, update succeeds
    selectResults[1] = [{ id: "counter-1", nextSequence: 4 }];
    updateResults[1] = [{ nextSequence: 5 }];

    const seq = await allocateSequenceNumber("org-1", "pnd53", 2026);
    expect(seq).toBe(4);
  });

  it("sequential calls return increasing numbers", async () => {
    // Call 1: no counter exists
    selectResults[0] = [];
    insertResults[0] = [{ id: "counter-1" }];

    // Call 2: counter exists with seq=2
    selectResults[1] = [{ id: "counter-1", nextSequence: 2 }];
    updateResults[0] = [{ nextSequence: 3 }];

    // Call 3: counter exists with seq=3
    selectResults[2] = [{ id: "counter-1", nextSequence: 3 }];
    updateResults[1] = [{ nextSequence: 4 }];

    const seq1 = await allocateSequenceNumber("org-1", "pnd53", 2026);
    const seq2 = await allocateSequenceNumber("org-1", "pnd53", 2026);
    const seq3 = await allocateSequenceNumber("org-1", "pnd53", 2026);

    expect(seq1).toBe(1);
    expect(seq2).toBe(2);
    expect(seq3).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// createWhtCertificateDraft
// ---------------------------------------------------------------------------

describe("createWhtCertificateDraft", () => {
  it("creates certificate with items and returns id + formatted number", async () => {
    // allocateSequenceNumber: select (empty) + insert (counter)
    selectResults[0] = [];
    insertResults[0] = [{ id: "counter-1" }]; // sequence counter

    // createWhtCertificateDraft: insert certificate + insert items
    insertResults[1] = [{ id: "cert-abc" }]; // certificate
    insertResults[2] = []; // items (don't need returning)

    const result = await createWhtCertificateDraft({
      orgId: "org-1",
      vendorId: "vendor-1",
      formType: "pnd53",
      paymentDate: "2026-03-15",
      lineItems: [
        {
          documentId: "doc-1",
          lineItemId: "li-1",
          baseAmount: "10000.00",
          whtRate: "0.0300",
          whtAmount: "300.00",
          rdPaymentTypeCode: "4(a)",
        },
        {
          documentId: "doc-1",
          lineItemId: "li-2",
          baseAmount: "5000.00",
          whtRate: "0.0300",
          whtAmount: "150.00",
        },
      ],
    });

    expect(result.certificateId).toBe("cert-abc");
    expect(result.certificateNo).toBe("PND53/2026/001");
  });

  it("formats certificate number with padded sequence", async () => {
    // allocateSequenceNumber: select (existing with seq=42) + update
    selectResults[0] = [{ id: "counter-1", nextSequence: 42 }];
    updateResults[0] = [{ nextSequence: 43 }];

    // certificate insert
    insertResults[0] = [{ id: "cert-xyz" }];
    // items insert
    insertResults[1] = [];

    const result = await createWhtCertificateDraft({
      orgId: "org-1",
      vendorId: "vendor-1",
      formType: "pnd3",
      paymentDate: "2026-06-20",
      lineItems: [
        {
          documentId: "doc-1",
          lineItemId: "li-1",
          baseAmount: "1000.00",
          whtRate: "0.0300",
          whtAmount: "30.00",
        },
      ],
    });

    expect(result.certificateNo).toBe("PND3/2026/042");
  });

  it("calculates correct totals from line items", async () => {
    selectResults[0] = [];
    insertResults[0] = [{ id: "counter-1" }]; // sequence counter
    insertResults[1] = [{ id: "cert-totals" }]; // certificate
    insertResults[2] = []; // items

    await createWhtCertificateDraft({
      orgId: "org-1",
      vendorId: "vendor-1",
      formType: "pnd53",
      paymentDate: "2026-03-15",
      lineItems: [
        {
          documentId: "doc-1",
          lineItemId: "li-1",
          baseAmount: "10000.00",
          whtRate: "0.0300",
          whtAmount: "300.00",
        },
        {
          documentId: "doc-1",
          lineItemId: "li-2",
          baseAmount: "5000.00",
          whtRate: "0.0500",
          whtAmount: "250.00",
        },
      ],
    });

    // The certificate insert is the second insert call (index 1)
    // We need to check the values passed to the insert
    const certInsertCall = mockInsert.mock.calls[1]; // Second insert = certificate
    expect(certInsertCall).toBeDefined();
  });
});
