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
    // 62 org-scoped tables x 1 select each = 62 mock calls
    for (let i = 0; i < 62; i++) {
      selectResults[i] = [];
    }

    const result = await generateFullDataExport("org-1");

    // 62 org-scoped tables x 2 formats (JSON + CSV) = 124 files
    expect(result.files).toHaveLength(124);

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
    expect(filenames).toContain("tax_rule_versions.json");
    expect(filenames).toContain("tax_rule_versions.csv");
    expect(filenames).toContain("tax_treatment_decisions.json");
    expect(filenames).toContain("tax_treatment_decisions.csv");
    expect(filenames).toContain("vat_input_items.json");
    expect(filenames).toContain("vat_input_items.csv");
    expect(filenames).toContain("vat_output_items.json");
    expect(filenames).toContain("vat_output_items.csv");
    expect(filenames).toContain("pp36_obligations.json");
    expect(filenames).toContain("pp36_obligations.csv");
    expect(filenames).toContain("vat_filings.json");
    expect(filenames).toContain("vat_filings.csv");
    expect(filenames).toContain("vat_filing_lines.json");
    expect(filenames).toContain("vat_filing_lines.csv");
    expect(filenames).toContain("vat_credit_carryforwards.json");
    expect(filenames).toContain("vat_credit_carryforwards.csv");
    expect(filenames).toContain("tax_payment_events.json");
    expect(filenames).toContain("tax_payment_events.csv");
    expect(filenames).toContain("gl_accounts.json");
    expect(filenames).toContain("gl_accounts.csv");
    expect(filenames).toContain("journal_entries.json");
    expect(filenames).toContain("journal_entries.csv");
    expect(filenames).toContain("journal_lines.json");
    expect(filenames).toContain("journal_lines.csv");
    expect(filenames).toContain("posting_outbox.json");
    expect(filenames).toContain("posting_outbox.csv");
    expect(filenames).toContain("posting_exceptions.json");
    expect(filenames).toContain("posting_exceptions.csv");
    expect(filenames).toContain("gl_opening_balances.json");
    expect(filenames).toContain("gl_opening_balances.csv");
    expect(filenames).toContain("establishments.json");
    expect(filenames).toContain("establishments.csv");
    expect(filenames).toContain("sales_transactions.json");
    expect(filenames).toContain("sales_transactions.csv");
    expect(filenames).toContain("voucher_sales.json");
    expect(filenames).toContain("voucher_sales.csv");
    expect(filenames).toContain("processor_settlements.json");
    expect(filenames).toContain("processor_settlements.csv");
    expect(filenames).toContain("cash_deposits.json");
    expect(filenames).toContain("cash_deposits.csv");
    expect(filenames).toContain("imports.json");
    expect(filenames).toContain("imports.csv");
    expect(filenames).toContain("import_documents.json");
    expect(filenames).toContain("import_documents.csv");
    expect(filenames).toContain("import_goods_lines.json");
    expect(filenames).toContain("import_goods_lines.csv");
    expect(filenames).toContain("import_charge_lines.json");
    expect(filenames).toContain("import_charge_lines.csv");
    expect(filenames).toContain("import_payments.json");
    expect(filenames).toContain("import_payments.csv");
    expect(filenames).toContain("skus.json");
    expect(filenames).toContain("skus.csv");
    expect(filenames).toContain("inventory_movements.json");
    expect(filenames).toContain("inventory_movements.csv");
    expect(filenames).toContain("inventory_counts.json");
    expect(filenames).toContain("inventory_counts.csv");
    expect(filenames).toContain("inventory_count_items.json");
    expect(filenames).toContain("inventory_count_items.csv");
    expect(filenames).toContain("inventory_statutory_overhead_components.json");
    expect(filenames).toContain("inventory_statutory_overhead_components.csv");
    expect(filenames).toContain("fixed_assets.json");
    expect(filenames).toContain("fixed_assets.csv");
    expect(filenames).toContain("depreciation_schedule.json");
    expect(filenames).toContain("depreciation_schedule.csv");
    expect(filenames).toContain("fixed_asset_depreciation_periods.json");
    expect(filenames).toContain("fixed_asset_depreciation_periods.csv");
    expect(filenames).toContain("close_checklists.json");
    expect(filenames).toContain("close_checklists.csv");
    expect(filenames).toContain("close_checklist_items.json");
    expect(filenames).toContain("close_checklist_items.csv");
    expect(filenames).toContain("cost_centers.json");
    expect(filenames).toContain("cost_centers.csv");
    expect(filenames).toContain("projects.json");
    expect(filenames).toContain("projects.csv");
    expect(filenames).toContain("allocation_rules.json");
    expect(filenames).toContain("allocation_rules.csv");
    expect(filenames).toContain("allocation_rule_targets.json");
    expect(filenames).toContain("allocation_rule_targets.csv");
    expect(filenames).toContain("org_ai_settings.json");
    expect(filenames).toContain("org_ai_settings.csv");
    expect(filenames).toContain("fx_valuation_layers.json");
    expect(filenames).toContain("fx_valuation_layers.csv");
    expect(filenames).toContain("cit_filings.json");
    expect(filenames).toContain("cit_filings.csv");
    expect(filenames).toContain("book_tax_adjustments.json");
    expect(filenames).toContain("book_tax_adjustments.csv");
    expect(filenames).toContain("loss_carry_forward_layers.json");
    expect(filenames).toContain("loss_carry_forward_layers.csv");
    expect(filenames).toContain("transfer_pricing_disclosures.json");
    expect(filenames).toContain("transfer_pricing_disclosures.csv");
    expect(filenames).toContain("copilot_sessions.json");
    expect(filenames).toContain("copilot_sessions.csv");
    expect(filenames).toContain("copilot_messages.json");
    expect(filenames).toContain("copilot_messages.csv");
    expect(filenames).toContain("copilot_tool_events.json");
    expect(filenames).toContain("copilot_tool_events.csv");
    expect(filenames).toContain("employees.json");
    expect(filenames).toContain("employees.csv");
    expect(filenames).toContain("employee_allowances.json");
    expect(filenames).toContain("employee_allowances.csv");
    expect(filenames).toContain("pay_runs.json");
    expect(filenames).toContain("pay_runs.csv");
    expect(filenames).toContain("pay_slips.json");
    expect(filenames).toContain("pay_slips.csv");
    expect(filenames).toContain("pnd_filings.json");
    expect(filenames).toContain("pnd_filings.csv");
    expect(filenames).toContain("sso_filings.json");
    expect(filenames).toContain("sso_filings.csv");
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
    for (let i = 1; i < 58; i++) {
      selectResults[i] = [];
    }

    const result = await generateFullDataExport("org-1");

    const jsonFiles = result.files.filter((f) => f.format === "json");
    expect(jsonFiles.length).toBe(62);

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

  it("redacts Copilot secret references from org AI settings export", async () => {
    for (let i = 0; i < 62; i++) {
      selectResults[i] = [];
    }
    selectResults[3] = [
      {
        id: "settings-1",
        orgId: "org-1",
        copilotProvider: "openai",
        copilotModel: "gpt-5.2",
        copilotApiKeySecretRef: "OPENAI_API_KEY_ORG_TEST",
        copilotApiKeyLast4: "abcd",
        copilotMonthlyBudgetUsd: "75.00",
        copilotLiveModelEnabled: true,
        copilotWriteToolsEnabled: false,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];

    const result = await generateFullDataExport("org-1");
    const aiJson = result.files.find((file) => file.filename === "org_ai_settings.json")!;
    const aiCsv = result.files.find((file) => file.filename === "org_ai_settings.csv")!;

    expect(aiJson.content).not.toContain("copilotApiKeySecretRef");
    expect(aiJson.content).not.toContain("copilotApiKeyLast4");
    expect(aiJson.content).not.toContain("OPENAI_API_KEY_ORG_TEST");
    expect(aiJson.content).not.toContain("abcd");
    expect(aiCsv.content).not.toContain("copilot_api_key_secret_ref");
    expect(aiCsv.content).not.toContain("copilot_api_key_last4");
    expect(aiCsv.content).not.toContain("OPENAI_API_KEY_ORG_TEST");
    expect(aiCsv.content).not.toContain("abcd");
  });

  it("exports close checklist closed_at in CSV headers", async () => {
    for (let i = 0; i < 58; i++) {
      selectResults[i] = [];
    }

    const result = await generateFullDataExport("org-1");
    const closeCsv = result.files.find(
      (f) => f.filename === "close_checklists.csv"
    );
    expect(closeCsv).toBeDefined();

    const headerLine = closeCsv!.content.replace("\uFEFF", "").split("\r\n")[0];
    expect(headerLine).toContain("closed_at");
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
