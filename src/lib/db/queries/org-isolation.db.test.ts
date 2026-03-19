import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";
import * as schema from "@/lib/db/schema";

/*
 * INTEGRATION TESTS -- Cross-Tenant Isolation
 * ============================================
 *
 * Validates that every query function properly scopes results by org_id.
 * This is the safety net for the most dangerous bug class in multi-tenant
 * financial software: cross-tenant data leaks.
 *
 * Strategy:
 *   1. Create Org A and Org B
 *   2. Populate Org A with data across all key tables
 *   3. Query using Org B's ID through the actual query functions
 *   4. Assert zero results for every query
 *
 * Requires Docker Postgres running:
 *   docker compose -f docker-compose.test.yml up -d
 */

const { db: testDb, pool } = createTestDb();

// Mock the db module so all query functions use our test database
vi.mock("@/lib/db/index", () => ({
  db: testDb,
}));

// Import query functions AFTER the mock is set up
const { getBankAccountsByOrg, getBankAccountById, findBankAccountByNumber } =
  await import("@/lib/db/queries/bank-accounts");
const {
  getTransactions,
  countTransactions,
  getStatementsByAccount,
  getStatementsWithTxnCount,
  getTransactionsByDateRange,
  getOverlappingStatements,
} = await import("@/lib/db/queries/transactions");
const { getVendorsByOrg, getVendorById } = await import(
  "@/lib/db/queries/vendors"
);
const { getDocumentsByOrg, getDocumentById, searchDocuments } = await import(
  "@/lib/db/queries/documents"
);
const { getOrgAiSettings } = await import("@/lib/db/queries/ai-settings");
const { getFilesByDocument } = await import(
  "@/lib/db/queries/document-files"
);

// Test data IDs populated during setup
let orgAId: string;
let orgBId: string;
let bankAccountAId: string;
let vendorAId: string;
let statementAId: string;
let documentAId: string;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  // Clean data between tests (keep schema)
  await testDb.delete(schema.documentFiles);
  await testDb.delete(schema.documentLineItems);
  await testDb.delete(schema.reconciliationMatches);
  await testDb.delete(schema.payments);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.transactions);
  await testDb.delete(schema.bankStatements);
  await testDb.delete(schema.bankAccounts);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.orgAiSettings);
  await testDb.delete(schema.users);
  await testDb.delete(schema.organizations);

  // Create two orgs
  const [orgA] = await testDb
    .insert(schema.organizations)
    .values({ name: "Org A - Alpha Co", taxId: "1111111111111" })
    .returning();
  const [orgB] = await testDb
    .insert(schema.organizations)
    .values({ name: "Org B - Beta Co", taxId: "2222222222222" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  // Populate Org A with representative data
  const [bankAccount] = await testDb
    .insert(schema.bankAccounts)
    .values({
      orgId: orgAId,
      bankCode: "KBANK",
      accountNumber: "1234567890",
      accountName: "Alpha Operating Account",
    })
    .returning();
  bankAccountAId = bankAccount.id;

  const [vendor] = await testDb
    .insert(schema.vendors)
    .values({
      orgId: orgAId,
      name: "Vendor One",
      nameTh: "ผู้ขายหนึ่ง",
      taxId: "3333333333333",
      entityType: "company",
    })
    .returning();
  vendorAId = vendor.id;

  const [statement] = await testDb
    .insert(schema.bankStatements)
    .values({
      orgId: orgAId,
      bankAccountId: bankAccountAId,
      periodStart: "2024-01-01",
      periodEnd: "2024-01-31",
      openingBalance: "100000.00",
      closingBalance: "150000.00",
      parserUsed: "kbank_csv",
      importStatus: "completed",
    })
    .returning();
  statementAId = statement.id;

  // Create transactions for Org A
  await testDb.insert(schema.transactions).values([
    {
      orgId: orgAId,
      bankAccountId: bankAccountAId,
      statementId: statementAId,
      date: "2024-01-05",
      description: "Payment from customer",
      amount: "25000.00",
      type: "credit",
      externalRef: "ref-001",
    },
    {
      orgId: orgAId,
      bankAccountId: bankAccountAId,
      statementId: statementAId,
      date: "2024-01-10",
      description: "Office rent",
      amount: "15000.00",
      type: "debit",
      externalRef: "ref-002",
    },
    {
      orgId: orgAId,
      bankAccountId: bankAccountAId,
      statementId: statementAId,
      date: "2024-01-15",
      description: "Supplier payment",
      amount: "10000.00",
      type: "debit",
      externalRef: "ref-003",
    },
  ]);

  // Create a document for Org A
  const [doc] = await testDb
    .insert(schema.documents)
    .values({
      orgId: orgAId,
      vendorId: vendorAId,
      type: "invoice",
      direction: "expense",
      documentNumber: "INV-2024-001",
      issueDate: "2024-01-10",
      totalAmount: "15000.00",
      status: "confirmed",
      needsReview: false,
    })
    .returning();
  documentAId = doc.id;

  // Create a document file for Org A
  await testDb
    .insert(schema.documentFiles)
    .values({
      orgId: orgAId,
      documentId: documentAId,
      fileUrl: "https://storage.example.com/org-a/inv-001.pdf",
      fileType: "application/pdf",
      originalFilename: "invoice-001.pdf",
      pipelineStatus: "completed",
    });

  // Create AI settings for Org A
  await testDb.insert(schema.orgAiSettings).values({
    orgId: orgAId,
    extractionModel: "gpt-4o",
    monthlyBudgetUsd: "50.00",
  });
});

// ---------------------------------------------------------------------------
// Bank Account isolation
// ---------------------------------------------------------------------------

describe("bank account isolation", () => {
  it("getBankAccountsByOrg returns nothing for Org B", async () => {
    const results = await getBankAccountsByOrg(orgBId);
    expect(results).toHaveLength(0);
  });

  it("getBankAccountsByOrg returns data for Org A", async () => {
    const results = await getBankAccountsByOrg(orgAId);
    expect(results).toHaveLength(1);
    expect(results[0].accountName).toBe("Alpha Operating Account");
  });

  it("getBankAccountById returns null for Org B even with Org A account ID", async () => {
    const result = await getBankAccountById(orgBId, bankAccountAId);
    expect(result).toBeNull();
  });

  it("findBankAccountByNumber returns null for Org B even with Org A account details", async () => {
    const result = await findBankAccountByNumber(orgBId, "KBANK", "1234567890");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Transaction isolation
// ---------------------------------------------------------------------------

describe("transaction isolation", () => {
  it("getTransactions returns nothing for Org B", async () => {
    const result = await getTransactions({ orgId: orgBId });
    expect(result.data).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it("getTransactions returns data for Org A", async () => {
    const result = await getTransactions({ orgId: orgAId });
    expect(result.data).toHaveLength(3);
  });

  it("countTransactions returns zero for Org B", async () => {
    const count = await countTransactions({ orgId: orgBId });
    expect(count).toBe(0);
  });

  it("countTransactions returns correct count for Org A", async () => {
    const count = await countTransactions({ orgId: orgAId });
    expect(count).toBe(3);
  });

  it("getTransactions with bankAccountId filter returns nothing for Org B", async () => {
    // Even if Org B somehow has the bank account ID, the org scope blocks it
    const result = await getTransactions({
      orgId: orgBId,
      bankAccountId: bankAccountAId,
    });
    expect(result.data).toHaveLength(0);
  });

  it("getTransactionsByDateRange returns nothing for Org B", async () => {
    const results = await getTransactionsByDateRange(
      orgBId,
      bankAccountAId,
      "2024-01-01",
      "2024-12-31"
    );
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bank Statement isolation
// ---------------------------------------------------------------------------

describe("bank statement isolation", () => {
  it("getStatementsByAccount returns nothing for Org B", async () => {
    const results = await getStatementsByAccount(orgBId, bankAccountAId);
    expect(results).toHaveLength(0);
  });

  it("getStatementsByAccount returns data for Org A", async () => {
    const results = await getStatementsByAccount(orgAId, bankAccountAId);
    expect(results).toHaveLength(1);
    expect(results[0].parserUsed).toBe("kbank_csv");
  });

  it("getStatementsWithTxnCount returns nothing for Org B", async () => {
    const results = await getStatementsWithTxnCount(orgBId, bankAccountAId);
    expect(results).toHaveLength(0);
  });

  it("getOverlappingStatements returns nothing for Org B", async () => {
    const results = await getOverlappingStatements(
      orgBId,
      bankAccountAId,
      "2024-01-01",
      "2024-01-31"
    );
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Vendor isolation
// ---------------------------------------------------------------------------

describe("vendor isolation", () => {
  it("getVendorsByOrg returns nothing for Org B", async () => {
    const results = await getVendorsByOrg(orgBId);
    expect(results).toHaveLength(0);
  });

  it("getVendorsByOrg returns data for Org A", async () => {
    const results = await getVendorsByOrg(orgAId);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Vendor One");
  });

  it("getVendorById returns null for Org B even with Org A vendor ID", async () => {
    const result = await getVendorById(orgBId, vendorAId);
    expect(result).toBeNull();
  });

  it("getVendorsByOrg with search returns nothing for Org B", async () => {
    const results = await getVendorsByOrg(orgBId, "Vendor");
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Document isolation
// ---------------------------------------------------------------------------

describe("document isolation", () => {
  it("getDocumentsByOrg returns nothing for Org B", async () => {
    const results = await getDocumentsByOrg(orgBId, "expense");
    expect(results).toHaveLength(0);
  });

  it("getDocumentsByOrg returns data for Org A", async () => {
    const results = await getDocumentsByOrg(orgAId, "expense");
    expect(results).toHaveLength(1);
  });

  it("getDocumentById returns null for Org B even with Org A document ID", async () => {
    const result = await getDocumentById(orgBId, documentAId);
    expect(result).toBeNull();
  });

  it("searchDocuments returns nothing for Org B", async () => {
    const result = await searchDocuments({
      orgId: orgBId,
      direction: "expense",
    });
    expect(result.data).toHaveLength(0);
  });

  it("searchDocuments with text search returns nothing for Org B", async () => {
    const result = await searchDocuments({
      orgId: orgBId,
      direction: "expense",
      search: "INV-2024",
    });
    expect(result.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Document File isolation
// ---------------------------------------------------------------------------

describe("document file isolation", () => {
  it("getFilesByDocument returns nothing for Org B even with Org A document ID", async () => {
    const results = await getFilesByDocument(orgBId, documentAId);
    expect(results).toHaveLength(0);
  });

  it("getFilesByDocument returns data for Org A", async () => {
    const results = await getFilesByDocument(orgAId, documentAId);
    expect(results).toHaveLength(1);
    expect(results[0].originalFilename).toBe("invoice-001.pdf");
  });
});

// ---------------------------------------------------------------------------
// AI Settings isolation
// ---------------------------------------------------------------------------

describe("AI settings isolation", () => {
  it("getOrgAiSettings returns null for Org B", async () => {
    const result = await getOrgAiSettings(orgBId);
    expect(result).toBeNull();
  });

  it("getOrgAiSettings returns data for Org A", async () => {
    const result = await getOrgAiSettings(orgAId);
    expect(result).not.toBeNull();
    expect(result!.extractionModel).toBe("gpt-4o");
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: Org B has its own data that doesn't leak to Org A
// ---------------------------------------------------------------------------

describe("bidirectional isolation", () => {
  it("Org B data does not appear in Org A queries", async () => {
    // Create data for Org B
    const [orgBAccount] = await testDb
      .insert(schema.bankAccounts)
      .values({
        orgId: orgBId,
        bankCode: "SCB",
        accountNumber: "9876543210",
        accountName: "Beta Operating Account",
      })
      .returning();

    await testDb.insert(schema.vendors).values({
      orgId: orgBId,
      name: "Vendor Two",
      taxId: "4444444444444",
      entityType: "individual",
    });

    await testDb.insert(schema.transactions).values({
      orgId: orgBId,
      bankAccountId: orgBAccount.id,
      date: "2024-02-01",
      description: "Org B transaction",
      amount: "99999.00",
      type: "credit",
      externalRef: "ref-b-001",
    });

    // Verify Org A still sees only its own data
    const orgAAccounts = await getBankAccountsByOrg(orgAId);
    expect(orgAAccounts).toHaveLength(1);
    expect(orgAAccounts[0].bankCode).toBe("KBANK");

    const orgAVendors = await getVendorsByOrg(orgAId);
    expect(orgAVendors).toHaveLength(1);
    expect(orgAVendors[0].name).toBe("Vendor One");

    const orgATxns = await getTransactions({ orgId: orgAId });
    expect(orgATxns.data).toHaveLength(3);
    expect(orgATxns.data.every((t) => t.orgId === orgAId)).toBe(true);

    // Verify Org B sees only its own data
    const orgBAccounts = await getBankAccountsByOrg(orgBId);
    expect(orgBAccounts).toHaveLength(1);
    expect(orgBAccounts[0].bankCode).toBe("SCB");

    const orgBVendors = await getVendorsByOrg(orgBId);
    expect(orgBVendors).toHaveLength(1);
    expect(orgBVendors[0].name).toBe("Vendor Two");

    const orgBTxns = await getTransactions({ orgId: orgBId });
    expect(orgBTxns.data).toHaveLength(1);
    expect(orgBTxns.data[0].description).toBe("Org B transaction");
  });
});
