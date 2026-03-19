import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the database
// ---------------------------------------------------------------------------

let selectCallCount = 0;
const selectResults: unknown[][] = [];

const mockSelect = vi.fn().mockImplementation(() => {
  const idx = selectCallCount++;
  const result = selectResults[idx] ?? [];

  function withChainMethods(
    arr: unknown[]
  ): unknown[] & Record<string, ReturnType<typeof vi.fn>> {
    const extended = arr as unknown[] &
      Record<string, ReturnType<typeof vi.fn>>;
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

const { generateFlowAccountExport } = await import("./flowaccount-export");

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  selectResults.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateFlowAccountExport", () => {
  it("generates CSV with correct Thai headers", async () => {
    // Documents query returns empty
    selectResults[0] = [];

    const result = await generateFlowAccountExport(
      "org-1",
      "2026-01-01",
      "2026-01-31",
      "expense"
    );

    // UTF-8 BOM present
    expect(result.csv.charCodeAt(0)).toBe(0xfeff);

    // Check Thai headers are present
    expect(result.csv).toContain("\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23"); // เลขที่เอกสาร
    expect(result.csv).toContain("\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48"); // วันที่
    expect(result.csv).toContain("\u0E20\u0E32\u0E29\u0E35\u0E21\u0E39\u0E25\u0E04\u0E48\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21"); // ภาษีมูลค่าเพิ่ม

    // Only header line, no data
    const lines = result.csv.trim().split("\r\n");
    expect(lines).toHaveLength(1);
  });

  it("has UTF-8 BOM as first character", async () => {
    selectResults[0] = [];

    const result = await generateFlowAccountExport(
      "org-1",
      "2026-01-01",
      "2026-01-31",
      "all"
    );

    expect(result.csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF line endings", async () => {
    selectResults[0] = [];

    const result = await generateFlowAccountExport(
      "org-1",
      "2026-01-01",
      "2026-01-31",
      "income"
    );

    expect(result.csv).toContain("\r\n");
    const withoutCRLF = result.csv.replace(/\r\n/g, "");
    expect(withoutCRLF).not.toContain("\n");
  });

  it("formats dates in Buddhist Era DD/MM/YYYY", async () => {
    selectResults[0] = [
      {
        id: "doc-1",
        documentNumber: "INV-001",
        issueDate: "2026-03-15",
        dueDate: "2026-04-15",
        subtotal: "10000.00",
        vatAmount: "700.00",
        totalAmount: "10700.00",
        direction: "expense",
        vendorName: "Test Co.",
        vendorNameTh: null,
        vendorTaxId: "0105564012345",
        vendorBranchNumber: "00000",
      },
    ];
    // Line items query
    selectResults[1] = [];

    const result = await generateFlowAccountExport(
      "org-1",
      "2026-03-01",
      "2026-03-31",
      "expense"
    );

    // 2026 + 543 = 2569
    expect(result.csv).toContain("15/03/2569");
    expect(result.csv).toContain("15/04/2569");
  });

  it("formats amounts with 2 decimal places", async () => {
    selectResults[0] = [
      {
        id: "doc-1",
        documentNumber: "INV-001",
        issueDate: "2026-01-10",
        dueDate: null,
        subtotal: "1234567.89",
        vatAmount: "86419.75",
        totalAmount: "1320987.64",
        direction: "expense",
        vendorName: "Big Corp",
        vendorNameTh: null,
        vendorTaxId: null,
        vendorBranchNumber: null,
      },
    ];
    selectResults[1] = [];

    const result = await generateFlowAccountExport(
      "org-1",
      "2026-01-01",
      "2026-01-31",
      "expense"
    );

    expect(result.csv).toContain("1234567.89");
    expect(result.csv).toContain("86419.75");
    expect(result.csv).toContain("1320987.64");
  });

  it("includes WHT rate and amount from line items", async () => {
    selectResults[0] = [
      {
        id: "doc-1",
        documentNumber: "INV-002",
        issueDate: "2026-02-05",
        dueDate: null,
        subtotal: "5000.00",
        vatAmount: "350.00",
        totalAmount: "5350.00",
        direction: "expense",
        vendorName: "Contractor",
        vendorNameTh: null,
        vendorTaxId: "1234567890123",
        vendorBranchNumber: "00000",
      },
    ];
    selectResults[1] = [
      {
        documentId: "doc-1",
        whtRate: "0.0300",
        whtAmount: "150.00",
      },
    ];

    const result = await generateFlowAccountExport(
      "org-1",
      "2026-02-01",
      "2026-02-28",
      "expense"
    );

    expect(result.csv).toContain("3%");
    expect(result.csv).toContain("150.00");
  });

  it("only includes specified direction", async () => {
    selectResults[0] = [
      {
        id: "doc-1",
        documentNumber: "INV-E001",
        issueDate: "2026-01-05",
        dueDate: null,
        subtotal: "1000.00",
        vatAmount: "70.00",
        totalAmount: "1070.00",
        direction: "expense",
        vendorName: "Expense Vendor",
        vendorNameTh: null,
        vendorTaxId: null,
        vendorBranchNumber: null,
      },
    ];
    selectResults[1] = [];

    const result = await generateFlowAccountExport(
      "org-1",
      "2026-01-01",
      "2026-01-31",
      "expense"
    );

    // We can verify the filename includes the direction
    expect(result.filename).toContain("expense");
    expect(result.filename).toBe("flowaccount_expense_2026-01-01_2026-01-31.csv");
  });

  it("generates correct filename", async () => {
    selectResults[0] = [];

    const result = await generateFlowAccountExport(
      "org-1",
      "2026-03-01",
      "2026-03-31",
      "income"
    );

    expect(result.filename).toBe("flowaccount_income_2026-03-01_2026-03-31.csv");
  });

  it("has all 13 CSV columns in header", async () => {
    selectResults[0] = [];

    const result = await generateFlowAccountExport(
      "org-1",
      "2026-01-01",
      "2026-01-31",
      "all"
    );

    const headerLine = result.csv.replace("\uFEFF", "").split("\r\n")[0];
    const headers = headerLine.split(",");
    expect(headers).toHaveLength(13);
  });

  it("prefers Thai vendor name when available", async () => {
    selectResults[0] = [
      {
        id: "doc-1",
        documentNumber: "INV-003",
        issueDate: "2026-01-10",
        dueDate: null,
        subtotal: "500.00",
        vatAmount: "35.00",
        totalAmount: "535.00",
        direction: "expense",
        vendorName: "English Name",
        vendorNameTh: "\u0E0A\u0E37\u0E48\u0E2D\u0E44\u0E17\u0E22",
        vendorTaxId: null,
        vendorBranchNumber: null,
      },
    ];
    selectResults[1] = [];

    const result = await generateFlowAccountExport(
      "org-1",
      "2026-01-01",
      "2026-01-31",
      "expense"
    );

    expect(result.csv).toContain("\u0E0A\u0E37\u0E48\u0E2D\u0E44\u0E17\u0E22");
    expect(result.csv).not.toContain("English Name");
  });
});
