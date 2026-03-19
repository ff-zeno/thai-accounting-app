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

const { generateFullDataExport } = await import("./full-export");

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  selectResults.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateFullDataExport", () => {
  it("generates all expected files", async () => {
    // 9 tables x 1 select each = 9 mock calls
    for (let i = 0; i < 9; i++) {
      selectResults[i] = [];
    }

    const result = await generateFullDataExport("org-1");

    // 9 tables x 2 formats (JSON + CSV) = 18 files
    expect(result.files).toHaveLength(18);

    const filenames = result.files.map((f) => f.filename);

    // Check for all expected files
    expect(filenames).toContain("documents.json");
    expect(filenames).toContain("documents.csv");
    expect(filenames).toContain("document_line_items.json");
    expect(filenames).toContain("document_line_items.csv");
    expect(filenames).toContain("vendors.json");
    expect(filenames).toContain("vendors.csv");
    expect(filenames).toContain("transactions.json");
    expect(filenames).toContain("transactions.csv");
    expect(filenames).toContain("bank_statements.json");
    expect(filenames).toContain("bank_statements.csv");
    expect(filenames).toContain("wht_certificates.json");
    expect(filenames).toContain("wht_certificates.csv");
    expect(filenames).toContain("wht_certificate_items.json");
    expect(filenames).toContain("wht_certificate_items.csv");
    expect(filenames).toContain("payments.json");
    expect(filenames).toContain("payments.csv");
    expect(filenames).toContain("vat_records.json");
    expect(filenames).toContain("vat_records.csv");
  });

  it("generates valid JSON in all JSON files", async () => {
    // Populate documents table with sample data
    selectResults[0] = [
      {
        id: "doc-1",
        orgId: "org-1",
        documentNumber: "INV-001",
        type: "invoice",
        direction: "expense",
        issueDate: "2026-01-15",
        subtotal: "10000.00",
        vatAmount: "700.00",
        totalAmount: "10700.00",
        status: "confirmed",
      },
    ];
    // Empty data for all other tables
    for (let i = 1; i < 9; i++) {
      selectResults[i] = [];
    }

    const result = await generateFullDataExport("org-1");

    const jsonFiles = result.files.filter((f) => f.format === "json");
    expect(jsonFiles.length).toBe(9);

    for (const file of jsonFiles) {
      expect(() => JSON.parse(file.content)).not.toThrow();
    }
  });

  it("generates CSV with correct headers for documents", async () => {
    selectResults[0] = [
      {
        id: "doc-1",
        orgId: "org-1",
        documentNumber: "INV-001",
        type: "invoice",
        direction: "expense",
        issueDate: "2026-01-15",
        dueDate: null,
        subtotal: "10000.00",
        vatAmount: "700.00",
        totalAmount: "10700.00",
        currency: "THB",
        exchangeRate: null,
        totalAmountThb: "10700.00",
        category: "office_supplies",
        status: "confirmed",
        vatPeriodYear: 2026,
        vatPeriodMonth: 1,
        vendorId: "vendor-1",
        relatedDocumentId: null,
        createdAt: new Date("2026-01-15T10:00:00Z"),
      },
    ];
    for (let i = 1; i < 9; i++) {
      selectResults[i] = [];
    }

    const result = await generateFullDataExport("org-1");

    const docsCsv = result.files.find((f) => f.filename === "documents.csv");
    expect(docsCsv).toBeDefined();

    const headerLine = docsCsv!.content.replace("\uFEFF", "").split("\r\n")[0];
    expect(headerLine).toContain("id");
    expect(headerLine).toContain("document_number");
    expect(headerLine).toContain("total_amount");
    expect(headerLine).toContain("vat_amount");
    expect(headerLine).toContain("status");
  });

  it("CSV files have UTF-8 BOM", async () => {
    for (let i = 0; i < 9; i++) {
      selectResults[i] = [];
    }

    const result = await generateFullDataExport("org-1");

    const csvFiles = result.files.filter((f) => f.format === "csv");
    for (const file of csvFiles) {
      expect(file.content.charCodeAt(0)).toBe(0xfeff);
    }
  });

  it("all files have correct format field", async () => {
    for (let i = 0; i < 9; i++) {
      selectResults[i] = [];
    }

    const result = await generateFullDataExport("org-1");

    for (const file of result.files) {
      if (file.filename.endsWith(".json")) {
        expect(file.format).toBe("json");
      } else if (file.filename.endsWith(".csv")) {
        expect(file.format).toBe("csv");
      }
    }
  });

  it("JSON contains data from the org", async () => {
    selectResults[0] = []; // documents
    selectResults[1] = []; // document_line_items
    selectResults[2] = [
      // vendors
      {
        id: "vendor-1",
        orgId: "org-1",
        name: "Test Vendor",
        nameTh: null,
        taxId: "0105564012345",
        entityType: "company",
        country: "TH",
      },
    ];
    for (let i = 3; i < 9; i++) {
      selectResults[i] = [];
    }

    const result = await generateFullDataExport("org-1");

    const vendorsJson = result.files.find(
      (f) => f.filename === "vendors.json"
    );
    expect(vendorsJson).toBeDefined();

    const parsed = JSON.parse(vendorsJson!.content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Test Vendor");
    expect(parsed[0].taxId).toBe("0105564012345");
  });

  it("CSV data row matches the record values", async () => {
    selectResults[0] = []; // documents
    selectResults[1] = []; // document_line_items
    selectResults[2] = [
      // vendors
      {
        id: "v-1",
        orgId: "org-1",
        name: "Acme Co",
        nameTh: "\u0E1A\u0E23\u0E34\u0E29\u0E31\u0E17 \u0E41\u0E2D\u0E04\u0E21\u0E35",
        displayAlias: null,
        taxId: "0105500001234",
        registrationNo: null,
        branchNumber: "00000",
        address: "123 Main St",
        addressTh: null,
        email: "acme@test.com",
        paymentTermsDays: 30,
        isVatRegistered: true,
        entityType: "company",
        country: "TH",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    for (let i = 3; i < 9; i++) {
      selectResults[i] = [];
    }

    const result = await generateFullDataExport("org-1");

    const vendorsCsv = result.files.find(
      (f) => f.filename === "vendors.csv"
    );
    expect(vendorsCsv).toBeDefined();

    const lines = vendorsCsv!.content.trim().split("\r\n");
    expect(lines).toHaveLength(2); // header + 1 data row

    const dataLine = lines[1];
    expect(dataLine).toContain("v-1");
    expect(dataLine).toContain("Acme Co");
    expect(dataLine).toContain("0105500001234");
    expect(dataLine).toContain("company");
  });
});
