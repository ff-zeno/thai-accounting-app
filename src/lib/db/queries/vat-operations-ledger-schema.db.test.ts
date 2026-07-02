import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
const HASH = "a".repeat(64);

async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    const constraint = (cause as { constraint?: string } | undefined)?.constraint;
    expect(`${String(error)} ${String(cause)} ${constraint ?? ""}`).toMatch(pattern);
    return;
  }
  throw new Error("Expected database operation to fail");
}

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.lock_override_user_id', 'test-cleanup', true)");
    await client.query("SELECT set_config('app.lock_override_reason', 'test cleanup reset', true)");
    await client.query(`
      DELETE FROM tax_payment_events;
      DELETE FROM vat_credit_carryforwards;
      DELETE FROM vat_filing_lines;
      DELETE FROM vat_input_items;
      DELETE FROM vat_output_items;
      DELETE FROM pp36_obligations;
      DELETE FROM period_locks;
      DELETE FROM vat_filings;
      DELETE FROM tax_treatment_decisions;
      DELETE FROM tax_rule_versions;
      DELETE FROM reconciliation_matches;
      DELETE FROM payments;
      DELETE FROM document_line_items;
      DELETE FROM document_files;
      DELETE FROM documents;
      DELETE FROM transactions;
      DELETE FROM bank_accounts;
      DELETE FROM vendors;
      DELETE FROM establishments;
      DELETE FROM organizations;
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

async function createVatSource() {
  const [org] = await testDb
    .insert(schema.organizations)
    .values({
      name: "VAT Ops Org",
      taxId: "1234567890123",
      branchNumber: "00000",
    })
    .returning();
  const [establishment] = await testDb
    .insert(schema.establishments)
    .values({
      orgId: org.id,
      branchNumber: "00000",
      nameEn: "Head Office",
      isHeadOffice: true,
      vatRegistered: true,
    })
    .returning();
  const [vendor] = await testDb
    .insert(schema.vendors)
    .values({
      orgId: org.id,
      name: "Thai Supplier",
      entityType: "company",
      country: "TH",
      taxId: "3333333333333",
      branchNumber: "00000",
    })
    .returning();
  const [doc] = await testDb
    .insert(schema.documents)
    .values({
      orgId: org.id,
      vendorId: vendor.id,
      direction: "expense",
      type: "invoice",
      status: "confirmed",
      issueDate: "2026-03-15",
      documentNumber: "TI-001",
      subtotal: "1000.00",
      vatAmount: "70.00",
      totalAmount: "1070.00",
      taxInvoiceSubtype: "full_ti",
    })
    .returning();
  const [line] = await testDb
    .insert(schema.documentLineItems)
    .values({
      orgId: org.id,
      documentId: doc.id,
      description: "Service",
      amount: "1000.00",
      vatAmount: "70.00",
    })
    .returning();

  return { org, establishment, vendor, doc, line };
}

describe("VAT operations ledger dark schema", () => {
  it("allows unreviewed input VAT items without CPA-unresolved claim dates", async () => {
    const { org, vendor, doc, line } = await createVatSource();

    await expect(
      testDb.insert(schema.vatInputItems).values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        sourceDocumentLineId: line.id,
        vendorId: vendor.id,
        taxInvoiceSubtype: "full_ti",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        status: "needs_review",
        sourceSnapshot: { documentNumber: "TI-001" },
        sourceSnapshotHash: HASH,
      })
    ).resolves.toBeDefined();
  });

  it("requires full or electronic tax invoice evidence before input VAT is claimable", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();

    const invalidCases = [
      {
        taxInvoiceSubtype: "abb" as const,
        taxInvoiceNo: "ABB-001",
        taxInvoiceDate: "2026-03-15",
      },
      {
        taxInvoiceSubtype: "not_a_ti" as const,
        taxInvoiceNo: "NONTI-001",
        taxInvoiceDate: "2026-03-15",
      },
      {
        taxInvoiceSubtype: "full_ti" as const,
        taxInvoiceNo: null,
        taxInvoiceDate: "2026-03-15",
      },
      {
        taxInvoiceSubtype: "full_ti" as const,
        taxInvoiceNo: "TI-NODATE",
        taxInvoiceDate: null,
      },
    ];

    for (const invalid of invalidCases) {
      await expectDbError(
        testDb.insert(schema.vatInputItems).values({
          orgId: org.id,
          establishmentId: establishment.id,
          sourceDocumentId: doc.id,
          vendorId: vendor.id,
          taxInvoiceSubtype: invalid.taxInvoiceSubtype,
          taxInvoiceNo: invalid.taxInvoiceNo,
          taxInvoiceDate: invalid.taxInvoiceDate,
          baseAmount: "1000.00",
          vatAmount: "70.00",
          vatRate: "0.0700",
          status: "claimable",
          sourceSnapshot: { documentNumber: invalid.taxInvoiceNo },
          sourceSnapshotHash: HASH,
        }),
        /vat_input_claimable_requires_full_tax_invoice_check/
      );
    }

    await expect(
      testDb.insert(schema.vatInputItems).values({
        orgId: org.id,
        establishmentId: establishment.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        taxInvoiceSubtype: "e_tax_invoice",
        taxInvoiceNo: "ETI-001",
        taxInvoiceDate: "2026-03-16",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        status: "claimable",
        sourceSnapshot: { documentNumber: "ETI-001" },
        sourceSnapshotHash: HASH,
      })
    ).resolves.toBeDefined();
  });

  it("enforces universal amount, rate, and period constraints", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();

    await expectDbError(
      testDb.insert(schema.vatInputItems).values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        taxInvoiceSubtype: "full_ti",
        baseAmount: "-1.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        status: "needs_review",
        sourceSnapshot: {},
        sourceSnapshotHash: HASH,
      }),
      /vat_input_amounts_nonnegative_check/
    );

    await expectDbError(
      testDb.insert(schema.vatFilings).values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 13,
        filingKind: "ordinary",
      }),
      /vat_filings_period_month_check/
    );
  });

  it("allows only one open ordinary draft per establishment VAT filing period", async () => {
    const { org, establishment } = await createVatSource();

    await testDb.insert(schema.vatFilings).values({
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
      filingKind: "ordinary",
      status: "draft",
    });

    await expectDbError(
      testDb.insert(schema.vatFilings).values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "ready_for_review",
      }),
      /vat_filings_open_ordinary_unique/
    );

    await testDb
      .update(schema.vatFilings)
      .set({ status: "filed" })
      .where(sql`${schema.vatFilings.orgId} = ${org.id}`);

    await expectDbError(
      testDb.insert(schema.vatFilings).values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "draft",
      }),
      /vat_filings_open_ordinary_unique/
    );

    // Branch-scoped PP30: the same period is open per establishment, so a
    // different VAT branch may hold its own ordinary draft concurrently.
    const [branch] = await testDb
      .insert(schema.establishments)
      .values({
        orgId: org.id,
        branchNumber: "00001",
        nameEn: "Branch 1",
        isHeadOffice: false,
        vatRegistered: true,
      })
      .returning();

    await expect(
      testDb.insert(schema.vatFilings).values({
        orgId: org.id,
        establishmentId: branch.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "draft",
      })
    ).resolves.toBeDefined();

    await expect(
      testDb.insert(schema.vatFilings).values({
        orgId: org.id,
        filingType: "pp36",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "draft",
      })
    ).resolves.toBeDefined();

    await testDb.insert(schema.vatFilings).values({
      orgId: org.id,
      establishmentId: establishment.id,
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 4,
      filingKind: "ordinary",
      status: "voided",
    });

    await expect(
      testDb.insert(schema.vatFilings).values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 4,
        filingKind: "ordinary",
        status: "draft",
      })
    ).resolves.toBeDefined();
  });

  it("enforces tax payment event idempotency per filing", async () => {
    const { org } = await createVatSource();
    const [filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        filingType: "pp36",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "filed",
        paymentStatus: "waiting_to_pay_tax",
      })
      .returning();

    const event = {
      orgId: org.id,
      filingId: filing.id,
      eventType: "payment" as const,
      eventStatus: "recorded" as const,
      paidAt: new Date("2026-04-15T02:00:00.000Z"),
      amount: "70.00",
      idempotencyKey: "rd-receipt-1",
      createdByUserId: "tester",
    };

    await testDb.insert(schema.taxPaymentEvents).values(event);

    await expectDbError(
      testDb.insert(schema.taxPaymentEvents).values(event),
      /tax_payment_events_idempotency/
    );

    await expectDbError(
      testDb
        .update(schema.taxPaymentEvents)
        .set({ amount: "71.00" })
        .where(sql`${schema.taxPaymentEvents.filingId} = ${filing.id}`),
      /tax payment event immutable fields cannot change/
    );
  });

  it("enforces source-level partial uniqueness for dark ledger rows", async () => {
    const { org, vendor, doc, line } = await createVatSource();
    const [decision] = await testDb
      .insert(schema.taxTreatmentDecisions)
      .values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        sourceDocumentLineId: line.id,
        treatmentType: "local_vat_input",
        reviewStatus: "needs_review",
      })
      .returning();

    await expectDbError(
      testDb.insert(schema.taxTreatmentDecisions).values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        sourceDocumentLineId: line.id,
        treatmentType: "local_vat_input",
        reviewStatus: "needs_review",
      }),
      /tax_treatment_line_active/
    );

    await testDb.insert(schema.vatInputItems).values({
      orgId: org.id,
      taxTreatmentDecisionId: decision.id,
      sourceDocumentId: doc.id,
      sourceDocumentLineId: line.id,
      vendorId: vendor.id,
      taxInvoiceSubtype: "full_ti",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      sourceSnapshot: {},
      sourceSnapshotHash: HASH,
    });

    await expectDbError(
      testDb.insert(schema.vatInputItems).values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        sourceDocumentLineId: line.id,
        vendorId: vendor.id,
        taxInvoiceSubtype: "full_ti",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        sourceSnapshot: {},
        sourceSnapshotHash: HASH,
      }),
      /vat_input_items_source_line_active/
    );
  });

  it("enforces global tax rule uniqueness and tax treatment source presence", async () => {
    await testDb.insert(schema.taxRuleVersions).values({
      ruleScope: "pp36_period_basis",
      version: "2026-01",
      effectiveFrom: "2026-01-01",
      ruleBody: { basis: "payment_date" },
    });

    await expectDbError(
      testDb.insert(schema.taxRuleVersions).values({
        ruleScope: "pp36_period_basis",
        version: "2026-01",
        effectiveFrom: "2026-01-01",
        ruleBody: { basis: "payment_date" },
      }),
      /tax_rule_versions_unique_active/
    );

    const { org } = await createVatSource();
    await expectDbError(
      testDb.insert(schema.taxTreatmentDecisions).values({
        orgId: org.id,
        treatmentType: "local_vat_input",
        reviewStatus: "needs_review",
      }),
      /tax_treatment_has_source_check/
    );
  });

  it("dedupes PP36 obligations by payment transaction while allowing installment rows by document line", async () => {
    const { org, vendor, doc, line } = await createVatSource();
    const [account] = await testDb
      .insert(schema.bankAccounts)
      .values({
        orgId: org.id,
        bankCode: "KBANK",
        accountNumber: "1234567890",
        accountName: "Main",
      })
      .returning();
    const [txn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: account.id,
        date: "2026-03-20",
        amount: "1070.00",
        type: "debit",
      })
      .returning();

    const obligation = {
      orgId: org.id,
      sourceDocumentId: doc.id,
      vendorId: vendor.id,
      vendorCountryCode: "SG",
      baseAmountThb: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      occurredOn: "2026-03-15",
      paymentDate: "2026-03-20",
      taxPointDate: "2026-03-20",
      periodBasis: "payment_date" as const,
      pp36PeriodYear: 2026,
      pp36PeriodMonth: 3,
      sourceSnapshot: {},
      sourceSnapshotHash: HASH,
    };

    await testDb.insert(schema.pp36Obligations).values({
      ...obligation,
      sourcePaymentTransactionId: txn.id,
    });
    await expectDbError(
      testDb.insert(schema.pp36Obligations).values({
        ...obligation,
        sourcePaymentTransactionId: txn.id,
      }),
      /pp36_obligations_source_active/
    );

    await testDb.insert(schema.pp36Obligations).values({
      ...obligation,
      sourceDocumentLineId: line.id,
    });
    await expectDbError(
      testDb.insert(schema.pp36Obligations).values({
        ...obligation,
        sourceDocumentLineId: line.id,
      }),
      /pp36_obligations_source_line_active/
    );
  });

  it("creates composite id/org unique indexes for later same-org trigger coverage", async () => {
    const indexes = await testDb.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'vat_filings_id_org_uniq',
          'vat_filing_lines_id_org_uniq',
          'vat_input_items_id_org_uniq',
          'vat_output_items_id_org_uniq',
          'pp36_obligations_id_org_uniq',
          'vat_credit_carryforwards_id_org_uniq',
          'tax_payment_events_id_org_uniq'
        )
    `);

    expect(indexes.rows).toHaveLength(7);
  });

  it("rejects cross-org source links on VAT ledger rows", async () => {
    const { org, doc } = await createVatSource();
    const [otherOrg] = await testDb
      .insert(schema.organizations)
      .values({
        name: "Other VAT Org",
        taxId: "9999999999999",
        branchNumber: "00000",
      })
      .returning();
    const [otherVendor] = await testDb
      .insert(schema.vendors)
      .values({
        orgId: otherOrg.id,
        name: "Other Supplier",
        entityType: "company",
        country: "TH",
      })
      .returning();

    await expectDbError(
      testDb.insert(schema.vatInputItems).values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: otherVendor.id,
        taxInvoiceSubtype: "full_ti",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        sourceSnapshot: {},
        sourceSnapshotHash: HASH,
      }),
      /cross-org reference rejected/
    );
  });

  it("enforces filing-line source shape and filed provenance links", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();
    const [filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "draft",
      })
      .returning();

    await expectDbError(
      testDb.insert(schema.vatFilingLines).values({
        orgId: org.id,
        filingId: filing.id,
        lineType: "input",
        amount: "70.00",
        vatAmount: "70.00",
        frozenSnapshot: {},
        frozenSnapshotHash: HASH,
      }),
      /vat_filing_lines_type_source_check/
    );

    await expectDbError(
      testDb.insert(schema.vatInputItems).values({
        orgId: org.id,
        establishmentId: establishment.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        taxInvoiceNo: "FILED-WITHOUT-LINE",
        taxInvoiceDate: "2026-03-15",
        taxInvoiceSubtype: "full_ti",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        status: "filed",
        sourceSnapshot: {},
        sourceSnapshotHash: HASH,
      }),
      /vat_input_status_links_check/
    );

    await expectDbError(
      testDb.insert(schema.vatOutputItems).values({
        orgId: org.id,
        establishmentId: establishment.id,
        sourceDocumentId: doc.id,
        customerId: vendor.id,
        taxInvoiceNo: "OUT-FILED-WITHOUT-LINE",
        taxInvoiceDate: "2026-03-15",
        documentDate: "2026-03-15",
        taxPointDate: "2026-03-15",
        taxPointBasis: "issue_date",
        baseAmount: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        outputPeriodYear: 2026,
        outputPeriodMonth: 3,
        status: "filed",
        sourceSnapshot: {},
        sourceSnapshotHash: HASH,
      }),
      /vat_output_status_links_check/
    );

    await expectDbError(
      testDb.insert(schema.pp36Obligations).values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        vendorCountryCode: "SG",
        baseAmountThb: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        occurredOn: "2026-03-15",
        paymentDate: "2026-03-20",
        taxPointDate: "2026-03-20",
        periodBasis: "payment_date",
        pp36PeriodYear: 2026,
        pp36PeriodMonth: 3,
        status: "pp36_filed",
        sourceSnapshot: {},
        sourceSnapshotHash: HASH,
      }),
      /pp36_status_links_check/
    );
  });

  it("blocks VAT filing and filing-line writes in locked periods", async () => {
    const { org, establishment } = await createVatSource();
    const [filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
      })
      .returning();

    // check_period_lock matches establishment exactly (NULL-coalesced
    // equality): the org-wide lock covers org-level writes, the
    // branch-scoped lock covers the branch-scoped PP30 filing's lines.
    await testDb.insert(schema.periodLocks).values([
      {
        orgId: org.id,
        domain: "vat_pp30",
        periodYear: 2026,
        periodMonth: 3,
        lockedByUserId: "tester",
        lockReason: "pp30 filed",
      },
      {
        orgId: org.id,
        establishmentId: establishment.id,
        domain: "vat_pp30",
        periodYear: 2026,
        periodMonth: 3,
        lockedByUserId: "tester",
        lockReason: "pp30 filed",
      },
    ]);

    await expectDbError(
      testDb.insert(schema.vatFilings).values({
        orgId: org.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "additional",
      }),
      /period is locked/
    );

    await expectDbError(
      testDb.insert(schema.vatFilingLines).values({
        orgId: org.id,
        filingId: filing.id,
        lineType: "carryforward",
        amount: "70.00",
        vatAmount: "70.00",
        frozenSnapshot: {},
        frozenSnapshotHash: HASH,
      }),
      /period is locked/
    );

    await expect(
      testDb
        .update(schema.vatFilings)
        .set({
          paymentStatus: "tax_paid",
          rdReceiptNo: "RD-123",
          paidAt: new Date("2026-04-15T02:00:00.000Z"),
        })
        .where(sql`${schema.vatFilings.id} = ${filing.id}`)
    ).resolves.toBeDefined();
  });

  it("blocks mutation of filed VAT filing lines and filed filing identity", async () => {
    const { org, establishment } = await createVatSource();
    const [filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "draft",
      })
      .returning();
    const [line] = await testDb
      .insert(schema.vatFilingLines)
      .values({
        orgId: org.id,
        filingId: filing.id,
        lineType: "carryforward",
        amount: "70.00",
        vatAmount: "70.00",
        frozenSnapshot: {},
        frozenSnapshotHash: HASH,
      })
      .returning();

    await testDb
      .update(schema.vatFilings)
      .set({ status: "filed", filedAt: new Date("2026-04-15T02:00:00.000Z") })
      .where(sql`${schema.vatFilings.id} = ${filing.id}`);

    await expectDbError(
      testDb
        .update(schema.vatFilingLines)
        .set({ vatAmount: "71.00" })
        .where(sql`${schema.vatFilingLines.id} = ${line.id}`),
      /filed VAT filing lines are immutable/
    );

    await expectDbError(
      testDb
        .update(schema.vatFilings)
        .set({ status: "draft" })
        .where(sql`${schema.vatFilings.id} = ${filing.id}`),
      /VAT filing status cannot move backward/
    );

    await expectDbError(
      testDb
        .update(schema.vatFilings)
        .set({ netPayable: "1.00" })
        .where(sql`${schema.vatFilings.id} = ${filing.id}`),
      /filed VAT filing totals and identity are immutable/
    );

    await expectDbError(
      testDb
        .delete(schema.vatFilings)
        .where(sql`${schema.vatFilings.id} = ${filing.id}`),
      /filed VAT filing cannot be hard-deleted/
    );

    await expectDbError(
      testDb
        .update(schema.vatFilings)
        .set({ deletedAt: new Date("2026-04-16T02:00:00.000Z") })
        .where(sql`${schema.vatFilings.id} = ${filing.id}`),
      /filed VAT filing totals and identity are immutable/
    );

    await expectDbError(
      testDb.insert(schema.vatFilingLines).values({
        orgId: org.id,
        filingId: filing.id,
        lineType: "carryforward",
        amount: "1.00",
        vatAmount: "1.00",
        frozenSnapshot: {},
        frozenSnapshotHash: HASH,
      }),
      /filed VAT filing lines are immutable/
    );
  });

  it("enforces VAT amendment chain period and type integrity", async () => {
    const { org, establishment } = await createVatSource();
    const [original] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "filed",
      })
      .returning();

    await expectDbError(
      testDb.insert(schema.vatFilings).values({
        orgId: org.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 4,
        filingKind: "amendment",
        amendsFilingId: original.id,
      }),
      /VAT amendment must target same filing type/
    );

    await expectDbError(
      testDb.insert(schema.vatFilings).values({
        orgId: org.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "additional",
        amendsFilingId: original.id,
      }),
      /must use amendment kind/
    );

    const [draftOriginal] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 5,
        filingKind: "ordinary",
        status: "draft",
      })
      .returning();

    await expectDbError(
      testDb.insert(schema.vatFilings).values({
        orgId: org.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 5,
        filingKind: "amendment",
        amendsFilingId: draftOriginal.id,
      }),
      /must target a filed VAT filing/
    );
  });

  it("enforces PP36 exact-period and paid-before-reclaim invariants", async () => {
    const { org, establishment, vendor, doc } = await createVatSource();
    const [pp36Filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        filingType: "pp36",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "draft",
      })
      .returning();
    const [pp36Line] = await testDb
      .insert(schema.vatFilingLines)
      .values({
        orgId: org.id,
        filingId: pp36Filing.id,
        lineType: "carryforward",
        amount: "70.00",
        vatAmount: "70.00",
        frozenSnapshot: {},
        frozenSnapshotHash: HASH,
      })
      .returning();
    const [pp30Filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 4,
        filingKind: "ordinary",
        status: "draft",
      })
      .returning();

    await expectDbError(
      testDb.insert(schema.pp36Obligations).values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        vendorCountryCode: "SG",
        baseAmountThb: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        occurredOn: "2026-03-15",
        paymentDate: "2026-03-20",
        taxPointDate: "2026-03-20",
        periodBasis: "payment_date",
        pp36PeriodYear: 2026,
        pp36PeriodMonth: 4,
        sourceSnapshot: {},
        sourceSnapshotHash: HASH,
      }),
      /pp36_period_matches_tax_point_check/
    );

    await expectDbError(
      testDb.insert(schema.pp36Obligations).values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        vendorCountryCode: "SG",
        baseAmountThb: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        occurredOn: "2026-03-15",
        paymentDate: "2026-03-20",
        taxPointDate: "2026-03-20",
        periodBasis: "payment_date",
        pp36PeriodYear: 2026,
        pp36PeriodMonth: 3,
        pp36FilingId: pp36Filing.id,
        pp36FilingLineId: pp36Line.id,
        pp30ReclaimFilingId: pp30Filing.id,
        status: "eligible_for_pp30_reclaim",
        sourceSnapshot: {},
        sourceSnapshotHash: HASH,
      }),
      /pp36_reclaim_requires_paid_check/
    );

    await expectDbError(
      testDb.insert(schema.pp36Obligations).values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        vendorId: vendor.id,
        vendorCountryCode: "SG",
        baseAmountThb: "1000.00",
        vatAmount: "70.00",
        vatRate: "0.0700",
        occurredOn: "2026-03-15",
        paymentDate: "2026-03-20",
        taxPointDate: "2026-03-20",
        periodBasis: "payment_date",
        pp36PeriodYear: 2026,
        pp36PeriodMonth: 3,
        pp36FilingId: pp36Filing.id,
        pp36FilingLineId: pp36Line.id,
        pp36PaidAt: new Date("2026-04-15T02:00:00.000Z"),
        status: "reclaimed_in_pp30",
        sourceSnapshot: {},
        sourceSnapshotHash: HASH,
      }),
      /pp36_reclaim_requires_paid_check/
    );
  });

  it("blocks mutation of source records bound to allocated VAT items", async () => {
    const { org, establishment, vendor, doc, line } = await createVatSource();
    const [filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "draft",
      })
      .returning();
    const [file] = await testDb
      .insert(schema.documentFiles)
      .values({
        orgId: org.id,
        documentId: doc.id,
        fileUrl: "s3://vat-evidence/test.pdf",
        fileType: "application/pdf",
      })
      .returning();
    const [account] = await testDb
      .insert(schema.bankAccounts)
      .values({
        orgId: org.id,
        bankCode: "KBANK",
        accountNumber: "1234567890",
        accountName: "Main",
      })
      .returning();
    const [txn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: account.id,
        date: "2026-03-20",
        amount: "1070.00",
        type: "debit",
      })
      .returning();
    const [payment] = await testDb
      .insert(schema.payments)
      .values({
        orgId: org.id,
        documentId: doc.id,
        paymentDate: "2026-03-20",
        grossAmount: "1070.00",
        netAmountPaid: "1070.00",
        paymentMethod: "bank_transfer",
      })
      .returning();
    const [match] = await testDb
      .insert(schema.reconciliationMatches)
      .values({
        orgId: org.id,
        transactionId: txn.id,
        documentId: doc.id,
        paymentId: payment.id,
        matchedAmount: "1070.00",
        matchType: "exact",
        matchedBy: "manual",
      })
      .returning();

    const [decision] = await testDb
      .insert(schema.taxTreatmentDecisions)
      .values({
        orgId: org.id,
        sourceDocumentId: doc.id,
        sourceDocumentLineId: line.id,
        treatmentType: "local_vat_input",
        reviewStatus: "confirmed",
      })
      .returning();

    await testDb.insert(schema.vatInputItems).values({
      orgId: org.id,
      establishmentId: establishment.id,
      taxTreatmentDecisionId: decision.id,
      sourceDocumentId: doc.id,
      sourceDocumentLineId: line.id,
      sourceTransactionId: txn.id,
      sourceReconciliationMatchId: match.id,
      vendorId: vendor.id,
      taxInvoiceSubtype: "full_ti",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      taxInvoiceNo: "LOCKED-INPUT-001",
      taxInvoiceDate: "2026-03-15",
      draftFilingId: filing.id,
      status: "allocated_to_draft",
      sourceSnapshot: {},
      sourceSnapshotHash: HASH,
    });

    await expectDbError(
      testDb
        .update(schema.documents)
        .set({ totalAmount: "1071.00" })
        .where(sql`${schema.documents.id} = ${doc.id}`),
      /VAT-bound document cannot be mutated/
    );

    await expectDbError(
      testDb
        .update(schema.documentLineItems)
        .set({ vatAmount: "71.00" })
        .where(sql`${schema.documentLineItems.id} = ${line.id}`),
      /VAT-bound document line cannot be mutated/
    );

    await expectDbError(
      testDb
        .update(schema.documentFiles)
        .set({ fileUrl: "s3://vat-evidence/replaced.pdf" })
        .where(sql`${schema.documentFiles.id} = ${file.id}`),
      /VAT-bound evidence file cannot be mutated/
    );

    await expectDbError(
      testDb
        .update(schema.transactions)
        .set({ amount: "1071.00" })
        .where(sql`${schema.transactions.id} = ${txn.id}`),
      /VAT-bound transaction cannot be mutated/
    );

    await expectDbError(
      testDb
        .update(schema.payments)
        .set({ netAmountPaid: "1071.00" })
        .where(sql`${schema.payments.id} = ${payment.id}`),
      /VAT-bound payment cannot be mutated/
    );

    await expectDbError(
      testDb
        .update(schema.reconciliationMatches)
        .set({ confidence: "0.50" })
        .where(sql`${schema.reconciliationMatches.id} = ${match.id}`),
      /VAT-bound reconciliation match cannot be mutated/
    );

    await expectDbError(
      testDb
        .update(schema.taxTreatmentDecisions)
        .set({ treatmentType: "not_vatable" })
        .where(sql`${schema.taxTreatmentDecisions.id} = ${decision.id}`),
      /VAT-bound tax treatment decision cannot be mutated/
    );
  });

  it("blocks source mutation when bound through allocated output VAT", async () => {
    const { org, establishment, vendor, doc, line } = await createVatSource();
    const [filing] = await testDb
      .insert(schema.vatFilings)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        filingKind: "ordinary",
        status: "draft",
      })
      .returning();
    const [account] = await testDb
      .insert(schema.bankAccounts)
      .values({
        orgId: org.id,
        bankCode: "KBANK",
        accountNumber: "2234567890",
        accountName: "Sales",
      })
      .returning();
    const [txn] = await testDb
      .insert(schema.transactions)
      .values({
        orgId: org.id,
        bankAccountId: account.id,
        date: "2026-03-20",
        amount: "1070.00",
        type: "credit",
      })
      .returning();

    await testDb.insert(schema.vatOutputItems).values({
      orgId: org.id,
      establishmentId: establishment.id,
      sourceDocumentId: doc.id,
      sourceDocumentLineId: line.id,
      sourceTransactionId: txn.id,
      customerId: vendor.id,
      taxInvoiceNo: "SO-001",
      taxInvoiceDate: "2026-03-15",
      documentDate: "2026-03-15",
      taxPointDate: "2026-03-15",
      taxPointBasis: "issue_date",
      baseAmount: "1000.00",
      vatAmount: "70.00",
      vatRate: "0.0700",
      outputPeriodYear: 2026,
      outputPeriodMonth: 3,
      draftFilingId: filing.id,
      status: "allocated_to_draft",
      sourceSnapshot: {},
      sourceSnapshotHash: HASH,
    });

    await expectDbError(
      testDb
        .update(schema.documents)
        .set({ totalAmount: "1071.00" })
        .where(sql`${schema.documents.id} = ${doc.id}`),
      /VAT-bound document cannot be mutated/
    );

    await expectDbError(
      testDb
        .update(schema.transactions)
        .set({ amount: "1071.00" })
        .where(sql`${schema.transactions.id} = ${txn.id}`),
      /VAT-bound transaction cannot be mutated/
    );
  });
});
