import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the database
// ---------------------------------------------------------------------------

let selectCallCount = 0;
const selectResults: unknown[][] = [];

/**
 * Build a mock select chain where the result is the array for that call index.
 * The result array is extended with chainable methods so `await db.select().from().where()`
 * and `await db.select().from().where().orderBy()` both resolve to the same array.
 */
const mockSelect = vi.fn().mockImplementation(() => {
  const idx = selectCallCount++;
  const result = selectResults[idx] ?? [];

  function withChainMethods(arr: unknown[]): unknown[] & Record<string, ReturnType<typeof vi.fn>> {
    const extended = arr as unknown[] & Record<string, ReturnType<typeof vi.fn>>;
    extended.orderBy = vi.fn().mockReturnValue(arr);
    extended.limit = vi.fn().mockReturnValue(arr);
    return extended;
  }

  const whereResult = withChainMethods([...result]);
  const fromResult = {
    where: vi.fn().mockReturnValue(whereResult),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnValue(result),
  };

  return {
    from: vi.fn().mockReturnValue(fromResult),
  };
});

vi.mock("@/lib/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

const { generateRdCsv } = await import("./rd-csv-export");

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  selectResults.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateRdCsv", () => {
  it("returns CSV with BOM and headers for empty period", async () => {
    // No certificates found
    selectResults[0] = [];

    const result = await generateRdCsv("org-1", 2026, 3, "pnd3");

    expect(result.filename).toBe("PND3_2569_03.csv");
    expect(result.csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(result.csv).toContain("\u0E25\u0E33\u0E14\u0E31\u0E1A"); // "ลำดับ" header
    // Only header line, no data
    const lines = result.csv.trim().split("\r\n");
    expect(lines).toHaveLength(1);
  });

  it("generates correct filename with Buddhist Era year", async () => {
    selectResults[0] = [];

    const result = await generateRdCsv("org-1", 2026, 12, "pnd53");
    expect(result.filename).toBe("PND53_2569_12.csv");
  });

  it("supports PND 2 exports", async () => {
    selectResults[0] = [];

    const result = await generateRdCsv("org-1", 2026, 4, "pnd2");
    expect(result.filename).toBe("PND2_2569_04.csv");
    expect(result.csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("generates CSV rows with correct fields for certificates", async () => {
    // Certificates query
    selectResults[0] = [
      {
        certId: "cert-1",
        paymentDate: "2026-03-15",
        vendorId: "vendor-1",
        status: "issued",
      },
    ];

    // Vendors query
    selectResults[1] = [
      {
        id: "vendor-1",
        name: "Test Company Ltd.",
        nameTh: "\u0E1A\u0E23\u0E34\u0E29\u0E31\u0E17 \u0E17\u0E14\u0E2A\u0E2D\u0E1A \u0E08\u0E33\u0E01\u0E31\u0E14",
        taxId: "0105564012345",
        branchNumber: "00000",
        entityType: "company" as const,
      },
    ];

    // Certificate items query
    selectResults[2] = [
      {
        certificateId: "cert-1",
        baseAmount: "10000.00",
        whtRate: "0.0300",
        whtAmount: "300.00",
        rdPaymentTypeCode: "4(a)",
      },
    ];

    const result = await generateRdCsv("org-1", 2026, 3, "pnd53");
    const lines = result.csv.trim().split("\r\n");

    // Header + 1 data row
    expect(lines).toHaveLength(2);

    const dataFields = lines[1].split(",");
    expect(dataFields[0]).toBe("1"); // Sequence number
    expect(dataFields[1]).toBe("0105564012345"); // Tax ID
    expect(dataFields[2]).toBe("00000"); // Branch
    expect(dataFields[3]).toBe("\u0E1A\u0E23\u0E34\u0E29\u0E31\u0E17"); // Title "บริษัท"
    // Payment date in B.E. format
    expect(dataFields[5]).toBe("15/03/2569");
    expect(dataFields[6]).toBe("4(a)"); // Income type
    expect(dataFields[7]).toBe("3"); // WHT rate as percentage
    expect(dataFields[8]).toBe("10000.00"); // Base amount
    expect(dataFields[9]).toBe("300.00"); // WHT amount
    expect(dataFields[10]).toBe("1"); // Condition
  });

  it("formats amounts with 2 decimal places without commas", async () => {
    selectResults[0] = [
      {
        certId: "cert-1",
        paymentDate: "2026-06-01",
        vendorId: "vendor-1",
        status: "issued",
      },
    ];
    selectResults[1] = [
      {
        id: "vendor-1",
        name: "Big Corp",
        nameTh: null,
        taxId: "0105564099999",
        branchNumber: "00001",
        entityType: "company" as const,
      },
    ];
    selectResults[2] = [
      {
        certificateId: "cert-1",
        baseAmount: "1234567.89",
        whtRate: "0.0500",
        whtAmount: "61728.39",
        rdPaymentTypeCode: "6",
      },
    ];

    const result = await generateRdCsv("org-1", 2026, 6, "pnd53");
    const dataLine = result.csv.trim().split("\r\n")[1];

    // No commas in amounts (only field-level commas)
    expect(dataLine).toContain("1234567.89");
    expect(dataLine).toContain("61728.39");
    expect(dataLine).not.toContain("1,234,567");
  });

  it("uses CRLF line endings", async () => {
    selectResults[0] = [];

    const result = await generateRdCsv("org-1", 2026, 1, "pnd3");
    expect(result.csv).toContain("\r\n");
    // No bare LF without CR
    const withoutCRLF = result.csv.replace(/\r\n/g, "");
    expect(withoutCRLF).not.toContain("\n");
  });

  it("includes all required CSV headers in correct order", async () => {
    selectResults[0] = [];

    const result = await generateRdCsv("org-1", 2026, 1, "pnd54");
    const headerLine = result.csv.replace("\uFEFF", "").split("\r\n")[0];
    const headers = headerLine.split(",");

    expect(headers).toHaveLength(11);
    expect(headers[0]).toBe("\u0E25\u0E33\u0E14\u0E31\u0E1A"); // ลำดับ
    expect(headers[1]).toBe("\u0E40\u0E25\u0E02\u0E1B\u0E23\u0E30\u0E08\u0E33\u0E15\u0E31\u0E27\u0E1C\u0E39\u0E49\u0E40\u0E2A\u0E35\u0E22\u0E20\u0E32\u0E29\u0E35"); // เลขประจำตัวผู้เสียภาษี
  });

  it("handles WHT rate formatting correctly", async () => {
    selectResults[0] = [
      {
        certId: "cert-1",
        paymentDate: "2026-01-10",
        vendorId: "vendor-1",
        status: "issued",
      },
    ];
    selectResults[1] = [
      {
        id: "vendor-1",
        name: "Person",
        nameTh: null,
        taxId: "1234567890123",
        branchNumber: "00000",
        entityType: "individual" as const,
      },
    ];
    selectResults[2] = [
      {
        certificateId: "cert-1",
        baseAmount: "5000.00",
        whtRate: "0.0200",
        whtAmount: "100.00",
        rdPaymentTypeCode: "1",
      },
    ];

    const result = await generateRdCsv("org-1", 2026, 1, "pnd3");
    const dataLine = result.csv.trim().split("\r\n")[1];
    const fields = dataLine.split(",");

    // 0.0200 * 100 = 2 -> "2"
    expect(fields[7]).toBe("2");
  });
});
