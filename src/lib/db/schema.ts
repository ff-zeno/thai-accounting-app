import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  json,
  jsonb,
  index,
  primaryKey,
  unique,
  uniqueIndex,
  pgEnum,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { newId } from "./ids";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const entityTypeEnum = pgEnum("entity_type", [
  "individual",
  "company",
  "foreign",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "invoice",
  "receipt",
  "debit_note",
  "credit_note",
  "wht_certificate_received",
]);

export const documentDirectionEnum = pgEnum("document_direction", [
  "expense",
  "income",
]);

export const taxInvoiceSubtypeEnum = pgEnum("tax_invoice_subtype", [
  "full_ti",
  "abb",
  "e_tax_invoice",
  "not_a_ti",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "draft",
  "confirmed",
  "partially_paid",
  "paid",
  "voided",
]);

export const pipelineStatusEnum = pgEnum("pipeline_status", [
  "uploaded",
  "extracting",
  "validating",
  "validated",
  "completed",
  "failed_extraction",
  "failed_validation",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "debit",
  "credit",
]);

export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "unmatched",
  "matched",
  "partially_matched",
]);

export const matchTypeEnum = pgEnum("match_type", [
  "exact",
  "fuzzy",
  "manual",
  "ai_suggested",
  "reference",
  "multi_signal",
  "pattern",
  "rule",
]);

export const matchedByEnum = pgEnum("matched_by", [
  "auto",
  "manual",
  "rule",
  "pattern",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer",
  "promptpay",
  "cheque",
  "cash",
]);

export const whtFormTypeEnum = pgEnum("wht_form_type", [
  "pnd2",
  "pnd3",
  "pnd53",
  "pnd54",
]);

export const whtCertStatusEnum = pgEnum("wht_cert_status", [
  "draft",
  "issued",
  "voided",
  "replaced",
]);

export const filingStatusEnum = pgEnum("filing_status", [
  "draft",
  "filed",
  "paid",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "void",
  "read_pii",
]);

export const taxTreatmentTypeEnum = pgEnum("tax_treatment_type", [
  "local_vat_input",
  "local_vat_output",
  "not_vatable",
  "pp36_foreign_service",
  "wht_only",
  "mixed",
]);

export const taxTreatmentReviewStatusEnum = pgEnum(
  "tax_treatment_review_status",
  ["ai_suggested", "needs_review", "confirmed", "rejected", "voided"]
);

export const taxRuleScopeEnum = pgEnum("tax_rule_scope", [
  "pp30_input_claim_window",
  "pp36_period_basis",
  "pp36_reclaim_timing",
  "output_tax_point",
  "tax_invoice_claimability",
]);

export const vatInputStatusEnum = pgEnum("vat_input_status", [
  "needs_review",
  "awaiting_tax_invoice",
  "claimable",
  "held",
  "do_not_claim",
  "allocated_to_draft",
  "filed",
  "expired",
  "voided_by_amendment",
]);

export const vatOutputStatusEnum = pgEnum("vat_output_status", [
  "needs_review",
  "reportable",
  "allocated_to_draft",
  "filed",
]);

export const pp36ObligationStatusEnum = pgEnum("pp36_obligation_status", [
  "needs_review",
  "pp36_required",
  "allocated_to_draft_pp36",
  "pp36_filed",
  "pp36_paid",
  "eligible_for_pp30_reclaim",
  "reclaimed_in_pp30",
  "voided_by_amendment",
]);

export const vatFilingTypeEnum = pgEnum("vat_filing_type", ["pp30", "pp36"]);

export const vatFilingKindEnum = pgEnum("vat_filing_kind", [
  "ordinary",
  "additional",
  "amendment",
]);

export const vatFilingStatusEnum = pgEnum("vat_filing_status", [
  "draft",
  "ready_for_review",
  "filed",
  "amended",
  "voided",
]);

export const vatPaymentStatusEnum = pgEnum("vat_payment_status", [
  "not_required",
  "waiting_to_pay_tax",
  "tax_paid",
  "refund_or_credit",
]);

export const vatFilingLineTypeEnum = pgEnum("vat_filing_line_type", [
  "input",
  "output",
  "pp36_obligation",
  "pp36_reclaim",
  "credit_note_adjustment",
  "carryforward",
]);

export const vatCreditCarryforwardStatusEnum = pgEnum(
  "vat_credit_carryforward_status",
  ["available", "applied", "refunded", "adjusted"]
);

export const taxPaymentEventTypeEnum = pgEnum("tax_payment_event_type", [
  "payment",
  "refund_received",
  "credit_applied",
  "adjustment",
]);

export const taxPaymentEventStatusEnum = pgEnum("tax_payment_event_status", [
  "recorded",
  "matched_to_bank",
  "posted_to_gl",
  "voided",
]);

export const pp36PeriodBasisEnum = pgEnum("pp36_period_basis", [
  "payment_date",
  "invoice_date",
  "occurred_on",
  "cpa_reviewed_override",
]);

export const vatOutputTaxPointBasisEnum = pgEnum("vat_output_tax_point_basis", [
  "issue_date",
  "payment_date",
  "delivery_date",
  "cpa_reviewed_override",
]);

export const vatRefundStatusEnum = pgEnum("vat_refund_status", [
  "not_requested",
  "requested",
  "approved",
  "received",
  "rejected",
]);

export const taxPostingOutboxStatusEnum = pgEnum("tax_posting_outbox_status", [
  "pending",
  "queued",
  "posted",
  "failed",
  "skipped",
]);

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------

const id = uuid("id").defaultRandom().primaryKey();

const createdAt = timestamp("created_at", { withTimezone: true })
  .defaultNow()
  .notNull();

const updatedAt = timestamp("updated_at", { withTimezone: true }).$onUpdate(
  () => new Date()
);

const deletedAt = timestamp("deleted_at", { withTimezone: true });

// ---------------------------------------------------------------------------
// Core Tables
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id,
  name: text("name").notNull(),
  nameTh: text("name_th"),
  taxId: varchar("tax_id", { length: 13 }).notNull(),
  branchNumber: varchar("branch_number", { length: 5 }).notNull().default("00000"),
  registrationNo: text("registration_no"),
  address: text("address"),
  addressTh: text("address_th"),
  isVatRegistered: boolean("is_vat_registered").default(false),
  hasPosSales: boolean("has_pos_sales").default(false).notNull(),
  hasEmployees: boolean("has_employees").default(false).notNull(),
  hasImportedServices: boolean("has_imported_services").default(false).notNull(),
  transferPricingRequired: boolean("transfer_pricing_required")
    .default(false)
    .notNull(),
  fiscalYearEndMonth: integer("fiscal_year_end_month").default(12),
  fiscalYearEndDay: integer("fiscal_year_end_day").default(31),
  createdAt,
  updatedAt,
  deletedAt,
});

export const users = pgTable("users", {
  id,
  clerkId: text("clerk_id").unique(),
  orgId: uuid("org_id").references(() => organizations.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role"),
  createdAt,
  updatedAt,
  deletedAt,
});

export const orgMemberships = pgTable(
  "org_memberships",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").default("member"), // member, admin, owner, accountant
    createdAt,
    deletedAt,
  },
  (t) => [unique("org_membership_unique").on(t.orgId, t.userId)]
);

export const vendors = pgTable(
  "vendors",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    nameTh: text("name_th"),
    displayAlias: text("display_alias"),
    taxId: varchar("tax_id", { length: 13 }),
    registrationNo: text("registration_no"),
    branchNumber: varchar("branch_number", { length: 5 }),
    address: text("address"),
    addressTh: text("address_th"),
    email: text("email"),
    paymentTermsDays: integer("payment_terms_days"),
    isVatRegistered: boolean("is_vat_registered"),
    entityType: entityTypeEnum("entity_type").notNull(),
    country: text("country").default("TH"),
    dbdVerified: boolean("dbd_verified").default(false),
    dbdData: jsonb("dbd_data"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [unique("vendors_org_tax_branch").on(t.orgId, t.taxId, t.branchNumber)]
);

export const bankAccounts = pgTable("bank_accounts", {
  id,
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  bankCode: text("bank_code").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name"),
  currency: varchar("currency", { length: 3 }).default("THB"),
  currentBalance: numeric("current_balance", { precision: 14, scale: 2 }),
  createdAt,
  updatedAt,
  deletedAt,
});

// ---------------------------------------------------------------------------
// Bank & Transaction Tables
// ---------------------------------------------------------------------------

export const bankStatements = pgTable(
  "bank_statements",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }),
    closingBalance: numeric("closing_balance", { precision: 14, scale: 2 }),
    fileUrl: text("file_url"),
    parserUsed: text("parser_used"),
    importStatus: text("import_status"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("stmt_org_account").on(t.orgId, t.bankAccountId),
  ]
);

export const transactions = pgTable(
  "transactions",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id),
    statementId: uuid("statement_id").references(() => bankStatements.id),
    date: date("date").notNull(),
    description: text("description"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    type: transactionTypeEnum("type").notNull(),
    runningBalance: numeric("running_balance", { precision: 14, scale: 2 }),
    referenceNo: text("reference_no"),
    channel: text("channel"),
    counterparty: text("counterparty"),
    reconciliationStatus: reconciliationStatusEnum("reconciliation_status").default(
      "unmatched"
    ),
    isPettyCash: boolean("is_petty_cash").default(false),
    externalRef: text("external_ref"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("txn_org_date").on(t.orgId, t.date),
    index("txn_org_recon_status").on(t.orgId, t.reconciliationStatus),
    index("txn_org_amount_date").on(t.orgId, t.amount, t.date),
    index("txn_org_counterparty").on(t.orgId, t.counterparty),
    index("txn_org_reference").on(t.orgId, t.referenceNo),
    // txn_dedup partial unique index is managed via migration (WHERE deleted_at IS NULL).
    // Partial index WHERE clauses for counterparty/reference live in migration SQL only.
  ]
);

// ---------------------------------------------------------------------------
// Document Tables
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    relatedDocumentId: uuid("related_document_id"),
    type: documentTypeEnum("type").notNull(),
    taxInvoiceSubtype: taxInvoiceSubtypeEnum("tax_invoice_subtype"),
    supplierTaxIdSnapshot: text("supplier_tax_id_snapshot"),
    supplierBranchNumberSnapshot: text("supplier_branch_number_snapshot"),
    buyerTaxIdSnapshot: text("buyer_tax_id_snapshot"),
    buyerBranchNumberSnapshot: text("buyer_branch_number_snapshot"),
    taxInvoiceSerialNumber: text("tax_invoice_serial_number"),
    taxInvoiceWords: text("tax_invoice_words"),
    isPp36Subject: boolean("is_pp36_subject").default(false),
    documentNumber: text("document_number"),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("THB"),
    exchangeRate: numeric("exchange_rate", { precision: 12, scale: 6 }),
    totalAmountThb: numeric("total_amount_thb", { precision: 14, scale: 2 }),
    direction: documentDirectionEnum("direction").notNull(),
    category: text("category"),
    status: documentStatusEnum("status").notNull().default("draft"),
    vatTreatment: text("vat_treatment"),
    vatRate: numeric("vat_rate", { precision: 5, scale: 4 }),
    vatEstablishmentId: uuid("vat_establishment_id").references(() => establishments.id),
    vatPeriodYear: integer("vat_period_year"),
    vatPeriodMonth: integer("vat_period_month"),
    vatPeriodOverrideReason: text("vat_period_override_reason"),
    vatPeriodOverriddenByUserId: text("vat_period_overridden_by_user_id"),
    vatPeriodOverriddenAt: timestamp("vat_period_overridden_at", {
      withTimezone: true,
    }),
    detectedLanguage: varchar("detected_language", { length: 5 }),
    aiConfidence: numeric("ai_confidence", { precision: 3, scale: 2 }),
    needsReview: boolean("needs_review").default(true),
    reviewNotes: text("review_notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("doc_org_vendor_date").on(t.orgId, t.vendorId, t.issueDate),
    index("doc_org_status").on(t.orgId, t.status),
    index("doc_org_vat_branch").on(t.orgId, t.vatEstablishmentId, t.vatTreatment),
    check("documents_vat_treatment_check", sql`
      ${t.vatTreatment} IS NULL
      OR ${t.vatTreatment} IN ('no_vat', 'input_vat', 'output_vat', 'exempt', 'not_claimable', 'pp36')
    `),
    check("documents_vat_rate_range_check", sql`
      ${t.vatRate} IS NULL OR (${t.vatRate} >= 0 AND ${t.vatRate} <= 1)
    `),
  ]
);

export const documentLineItems = pgTable("document_line_items", {
  id,
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  description: text("description"),
  quantity: numeric("quantity", { precision: 10, scale: 4 }),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }),
  whtRate: numeric("wht_rate", { precision: 5, scale: 4 }),
  whtAmount: numeric("wht_amount", { precision: 14, scale: 2 }),
  whtType: text("wht_type"),
  rdPaymentTypeCode: text("rd_payment_type_code"),
  accountCode: text("account_code"),
  createdAt,
  updatedAt,
  deletedAt,
});

export const documentFiles = pgTable(
  "document_files",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    fileUrl: text("file_url").notNull(),
    fileType: text("file_type"),
    pageNumber: integer("page_number"),
    originalFilename: text("original_filename"),
    pipelineStatus: pipelineStatusEnum("pipeline_status").notNull().default("uploaded"),
    aiRawResponse: jsonb("ai_raw_response"),
    aiModelUsed: text("ai_model_used"),
    aiCostTokens: integer("ai_cost_tokens"),
    aiCostUsd: numeric("ai_cost_usd", { precision: 8, scale: 6 }),
    aiPurpose: text("ai_purpose"),
    aiInputTokens: integer("ai_input_tokens"),
    aiOutputTokens: integer("ai_output_tokens"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("doc_files_org_created").on(t.orgId, t.createdAt),
    index("doc_files_document").on(t.documentId),
  ]
);

// ---------------------------------------------------------------------------
// Payment & Reconciliation Tables
// ---------------------------------------------------------------------------

export const payments = pgTable("payments", {
  id,
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  paymentDate: date("payment_date").notNull(),
  grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
  whtAmountWithheld: numeric("wht_amount_withheld", {
    precision: 14,
    scale: 2,
  }),
  netAmountPaid: numeric("net_amount_paid", {
    precision: 14,
    scale: 2,
  }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method"),
  isEwht: boolean("is_ewht").default(false),
  notes: text("notes"),
  createdAt,
  updatedAt,
  deletedAt,
});

export const reconciliationMatches = pgTable(
  "reconciliation_matches",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    matchedAmount: numeric("matched_amount", { precision: 14, scale: 2 }),
    matchType: matchTypeEnum("match_type").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    matchedBy: matchedByEnum("matched_by").notNull(),
    matchMetadata: jsonb("match_metadata"),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    // recon_txn_doc partial unique index managed via migration (WHERE deleted_at IS NULL)
    index("recon_matches_document").on(t.documentId),
  ]
);

// ---------------------------------------------------------------------------
// WHT & Tax Tables
// ---------------------------------------------------------------------------

export const whtCertificates = pgTable(
  "wht_certificates",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    certificateNo: text("certificate_no").notNull(),
    payeeVendorId: uuid("payee_vendor_id")
      .notNull()
      .references(() => vendors.id),
    paymentDate: date("payment_date"),
    totalBaseAmount: numeric("total_base_amount", { precision: 14, scale: 2 }),
    totalWht: numeric("total_wht", { precision: 14, scale: 2 }),
    formType: whtFormTypeEnum("form_type").notNull(),
    filingId: uuid("filing_id").references(() => whtMonthlyFilings.id),
    payerTaxIdSnapshot: text("payer_tax_id_snapshot").notNull().default(""),
    payerAddressSnapshot: text("payer_address_snapshot").notNull().default(""),
    payeeAddressSnapshot: text("payee_address_snapshot").notNull().default(""),
    payeeIdNumberSnapshot: text("payee_id_number_snapshot").notNull().default(""),
    paymentTypeDescription: text("payment_type_description").notNull().default(""),
    signatoryNameSnapshot: text("signatory_name_snapshot").notNull().default(""),
    signatoryPositionSnapshot: text("signatory_position_snapshot")
      .notNull()
      .default(""),
    rateBelowDefaultAcknowledgedByUserId: text(
      "rate_below_default_acknowledged_by_user_id"
    ),
    rateBelowDefaultAcknowledgedAt: timestamp(
      "rate_below_default_acknowledged_at",
      { withTimezone: true }
    ),
    rateBelowDefaultStatutoryRate: numeric(
      "rate_below_default_statutory_rate",
      { precision: 5, scale: 4 }
    ),
    rateBelowDefaultSelectedRate: numeric(
      "rate_below_default_selected_rate",
      { precision: 5, scale: 4 }
    ),
    rateBelowDefaultRationale: text("rate_below_default_rationale"),
    rateBelowDefaultAccountantNote: text("rate_below_default_accountant_note"),
    pdfUrl: text("pdf_url"),
    status: whtCertStatusEnum("status").notNull().default("draft"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    replacementCertId: uuid("replacement_cert_id"),
    issuedDate: date("issued_date"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [unique("wht_cert_org_no").on(t.orgId, t.certificateNo)]
);

export const whtCertificateItems = pgTable("wht_certificate_items", {
  id,
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  certificateId: uuid("certificate_id")
    .notNull()
    .references(() => whtCertificates.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  lineItemId: uuid("line_item_id").references(() => documentLineItems.id),
  baseAmount: numeric("base_amount", { precision: 14, scale: 2 }),
  whtRate: numeric("wht_rate", { precision: 5, scale: 4 }),
  whtAmount: numeric("wht_amount", { precision: 14, scale: 2 }),
  rdPaymentTypeCode: text("rd_payment_type_code"),
  whtType: text("wht_type"),
  createdAt,
  updatedAt,
  deletedAt,
});

export const whtSequenceCounters = pgTable(
  "wht_sequence_counters",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    formType: whtFormTypeEnum("form_type").notNull(),
    year: integer("year").notNull(),
    nextSequence: integer("next_sequence").notNull().default(1),
    createdAt,
    updatedAt,
    // NO deletedAt — sequence counters must never be deleted
  },
  (t) => [unique("wht_seq_org_form_year").on(t.orgId, t.formType, t.year)]
);

export const whtMonthlyFilings = pgTable(
  "wht_monthly_filings",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    formType: whtFormTypeEnum("form_type").notNull(),
    totalBaseAmount: numeric("total_base_amount", { precision: 14, scale: 2 }),
    totalWhtAmount: numeric("total_wht_amount", { precision: 14, scale: 2 }),
    status: filingStatusEnum("status").notNull().default("draft"),
    filingDate: date("filing_date"),
    deadline: date("deadline"),
    periodLocked: boolean("period_locked").default(false),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    unique("wht_filing_org_period").on(
      t.orgId,
      t.periodYear,
      t.periodMonth,
      t.formType
    ),
  ]
);

export const whtRates = pgTable("wht_rates", {
  id,
  paymentType: text("payment_type").notNull(),
  entityType: entityTypeEnum("entity_type").notNull(),
  rdPaymentTypeCode: text("rd_payment_type_code"),
  standardRate: numeric("standard_rate", { precision: 5, scale: 4 }).notNull(),
  ewhtRate: numeric("ewht_rate", { precision: 5, scale: 4 }),
  ewhtValidFrom: date("ewht_valid_from"),
  ewhtValidTo: date("ewht_valid_to"),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  createdAt,
  updatedAt,
  // NO deletedAt — reference data managed via effective dates
});

export const taxRuleVersions = pgTable(
  "tax_rule_versions",
  {
    id,
    orgId: uuid("org_id").references(() => organizations.id),
    ruleScope: taxRuleScopeEnum("rule_scope").notNull(),
    version: text("version").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    ruleBody: jsonb("rule_body").notNull(),
    sourceUrl: text("source_url"),
    sourceCheckedAt: timestamp("source_checked_at", { withTimezone: true }),
    cpaReviewedByUserId: text("cpa_reviewed_by_user_id"),
    cpaReviewedAt: timestamp("cpa_reviewed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("tax_rule_versions_unique_active")
      .on(
        sql`COALESCE(${t.orgId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        t.ruleScope,
        t.version
      )
      .where(sql`${t.deletedAt} IS NULL`),
    index("tax_rule_versions_lookup")
      .on(t.orgId, t.ruleScope, t.effectiveFrom)
      .where(sql`${t.deletedAt} IS NULL`),
  ]
);

export const taxTreatmentDecisions = pgTable(
  "tax_treatment_decisions",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    sourceDocumentId: uuid("source_document_id").references(() => documents.id),
    sourceDocumentLineId: uuid("source_document_line_id").references(
      () => documentLineItems.id
    ),
    sourceTransactionId: uuid("source_transaction_id").references(
      () => transactions.id
    ),
    sourcePaymentId: uuid("source_payment_id").references(() => payments.id),
    sourceReconciliationMatchId: uuid("source_reconciliation_match_id").references(
      () => reconciliationMatches.id
    ),
    treatmentType: taxTreatmentTypeEnum("treatment_type").notNull(),
    reviewStatus: taxTreatmentReviewStatusEnum("review_status")
      .notNull()
      .default("needs_review"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
    ruleVersionId: uuid("rule_version_id").references(() => taxRuleVersions.id),
    suggestedBy: text("suggested_by"),
    confirmedByUserId: text("confirmed_by_user_id"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("tax_treatment_org_status")
      .on(t.orgId, t.reviewStatus, t.createdAt)
      .where(sql`${t.deletedAt} IS NULL`),
    index("tax_treatment_document")
      .on(t.orgId, t.sourceDocumentId)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("tax_treatment_line_active")
      .on(t.orgId, t.sourceDocumentLineId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.sourceDocumentLineId} IS NOT NULL`),
    check(
      "tax_treatment_confidence_range_check",
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`
    ),
    check(
      "tax_treatment_has_source_check",
      sql`num_nonnulls(${t.sourceDocumentId}, ${t.sourceDocumentLineId}, ${t.sourceTransactionId}, ${t.sourcePaymentId}, ${t.sourceReconciliationMatchId}) >= 1`
    ),
  ]
);

export const vatInputItems = pgTable(
  "vat_input_items",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id").references(() => establishments.id),
    taxTreatmentDecisionId: uuid("tax_treatment_decision_id").references(
      () => taxTreatmentDecisions.id
    ),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => documents.id),
    sourceDocumentLineId: uuid("source_document_line_id").references(
      () => documentLineItems.id
    ),
    sourceTransactionId: uuid("source_transaction_id").references(
      () => transactions.id
    ),
    sourceReconciliationMatchId: uuid("source_reconciliation_match_id").references(
      () => reconciliationMatches.id
    ),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    taxInvoiceNo: text("tax_invoice_no"),
    taxInvoiceDate: date("tax_invoice_date"),
    taxInvoiceReceivedDate: date("tax_invoice_received_date"),
    taxInvoiceSubtype: taxInvoiceSubtypeEnum("tax_invoice_subtype").notNull(),
    documentDate: date("document_date"),
    paymentDate: date("payment_date"),
    baseAmount: numeric("base_amount", { precision: 14, scale: 2 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull(),
    vatRate: numeric("vat_rate", { precision: 5, scale: 4 }).notNull(),
    eligiblePeriodYear: integer("eligible_period_year"),
    eligiblePeriodMonth: integer("eligible_period_month"),
    expiryPeriodYear: integer("expiry_period_year"),
    expiryPeriodMonth: integer("expiry_period_month"),
    claimPeriodYear: integer("claim_period_year"),
    claimPeriodMonth: integer("claim_period_month"),
    claimBasisDate: date("claim_basis_date"),
    claimWindowRuleVersionId: uuid("claim_window_rule_version_id").references(
      () => taxRuleVersions.id
    ),
    status: vatInputStatusEnum("status").notNull().default("needs_review"),
    statusReason: text("status_reason"),
    draftFilingId: uuid("draft_filing_id").references(
      (): AnyPgColumn => vatFilings.id
    ),
    filedFilingLineId: uuid("filed_filing_line_id").references(
      (): AnyPgColumn => vatFilingLines.id
    ),
    sourceSnapshot: jsonb("source_snapshot").notNull(),
    sourceSnapshotHash: text("source_snapshot_hash").notNull(),
    snapshotVersion: text("snapshot_version").notNull().default("vat_snapshot_v1"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("vat_input_items_id_org_uniq").on(t.id, t.orgId),
    index("vat_input_items_org_status")
      .on(t.orgId, t.status, t.createdAt)
      .where(sql`${t.deletedAt} IS NULL`),
    index("vat_input_items_org_expiry")
      .on(t.orgId, t.expiryPeriodYear, t.expiryPeriodMonth, t.status)
      .where(sql`${t.deletedAt} IS NULL`),
    index("vat_input_items_document")
      .on(t.orgId, t.sourceDocumentId)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("vat_input_items_source_line_active")
      .on(t.orgId, t.sourceDocumentLineId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.sourceDocumentLineId} IS NOT NULL`),
    uniqueIndex("vat_input_items_source_document_active")
      .on(t.orgId, t.sourceDocumentId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.sourceDocumentLineId} IS NULL`),
    check("vat_input_amounts_nonnegative_check", sql`${t.baseAmount} >= 0 AND ${t.vatAmount} >= 0`),
    check("vat_input_rate_range_check", sql`${t.vatRate} >= 0 AND ${t.vatRate} <= 1`),
    check("vat_input_claimable_establishment_check", sql`
      ${t.status} NOT IN ('claimable', 'allocated_to_draft', 'filed')
      OR ${t.establishmentId} IS NOT NULL
    `),
    check(
      "vat_input_snapshot_hash_check",
      sql`${t.sourceSnapshotHash} ~ '^[0-9a-f]{64}$'`
    ),
    check("vat_input_period_month_check", sql`
      (${t.eligiblePeriodMonth} IS NULL OR (${t.eligiblePeriodMonth} >= 1 AND ${t.eligiblePeriodMonth} <= 12))
      AND (${t.expiryPeriodMonth} IS NULL OR (${t.expiryPeriodMonth} >= 1 AND ${t.expiryPeriodMonth} <= 12))
      AND (${t.claimPeriodMonth} IS NULL OR (${t.claimPeriodMonth} >= 1 AND ${t.claimPeriodMonth} <= 12))
    `),
    check("vat_input_claimable_requires_full_tax_invoice_check", sql`
      ${t.status} NOT IN ('claimable', 'allocated_to_draft', 'filed')
      OR (
        ${t.taxInvoiceSubtype} IN ('full_ti', 'e_tax_invoice')
        AND ${t.taxInvoiceNo} IS NOT NULL
        AND ${t.taxInvoiceDate} IS NOT NULL
      )
    `),
    check("vat_input_status_links_check", sql`
      (${t.status} <> 'allocated_to_draft' OR ${t.draftFilingId} IS NOT NULL)
      AND (${t.status} <> 'filed' OR ${t.filedFilingLineId} IS NOT NULL)
    `),
  ]
);

export const vatOutputItems = pgTable(
  "vat_output_items",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id").references(() => establishments.id),
    taxTreatmentDecisionId: uuid("tax_treatment_decision_id").references(
      () => taxTreatmentDecisions.id
    ),
    sourceDocumentId: uuid("source_document_id").references(() => documents.id),
    sourceDocumentLineId: uuid("source_document_line_id").references(
      () => documentLineItems.id
    ),
    sourcePosSaleId: uuid("source_pos_sale_id"),
    sourceTransactionId: uuid("source_transaction_id").references(
      () => transactions.id
    ),
    customerId: uuid("customer_id").references(() => vendors.id),
    taxInvoiceNo: text("tax_invoice_no"),
    taxInvoiceDate: date("tax_invoice_date").notNull(),
    documentDate: date("document_date").notNull(),
    taxPointDate: date("tax_point_date").notNull(),
    taxPointBasis: vatOutputTaxPointBasisEnum("tax_point_basis").notNull(),
    taxPointRuleVersionId: uuid("tax_point_rule_version_id").references(
      () => taxRuleVersions.id
    ),
    baseAmount: numeric("base_amount", { precision: 14, scale: 2 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull(),
    vatRate: numeric("vat_rate", { precision: 5, scale: 4 }).notNull(),
    outputPeriodYear: integer("output_period_year").notNull(),
    outputPeriodMonth: integer("output_period_month").notNull(),
    status: vatOutputStatusEnum("status").notNull().default("needs_review"),
    draftFilingId: uuid("draft_filing_id").references(
      (): AnyPgColumn => vatFilings.id
    ),
    filedFilingLineId: uuid("filed_filing_line_id").references(
      (): AnyPgColumn => vatFilingLines.id
    ),
    sourceSnapshot: jsonb("source_snapshot").notNull(),
    sourceSnapshotHash: text("source_snapshot_hash").notNull(),
    snapshotVersion: text("snapshot_version").notNull().default("vat_snapshot_v1"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("vat_output_items_id_org_uniq").on(t.id, t.orgId),
    index("vat_output_items_org_period")
      .on(t.orgId, t.outputPeriodYear, t.outputPeriodMonth, t.status)
      .where(sql`${t.deletedAt} IS NULL`),
    index("vat_output_items_document")
      .on(t.orgId, t.sourceDocumentId)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("vat_output_items_source_line_active")
      .on(t.orgId, t.sourceDocumentLineId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.sourceDocumentLineId} IS NOT NULL`),
    uniqueIndex("vat_output_items_source_document_active")
      .on(t.orgId, t.sourceDocumentId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.sourceDocumentId} IS NOT NULL AND ${t.sourceDocumentLineId} IS NULL`),
    check("vat_output_amounts_nonnegative_check", sql`${t.baseAmount} >= 0 AND ${t.vatAmount} >= 0`),
    check("vat_output_rate_range_check", sql`${t.vatRate} >= 0 AND ${t.vatRate} <= 1`),
    check("vat_output_reportable_establishment_check", sql`
      ${t.status} NOT IN ('reportable', 'allocated_to_draft', 'filed')
      OR ${t.establishmentId} IS NOT NULL
    `),
    check(
      "vat_output_snapshot_hash_check",
      sql`${t.sourceSnapshotHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "vat_output_has_source_check",
      sql`num_nonnulls(${t.sourceDocumentId}, ${t.sourceDocumentLineId}, ${t.sourcePosSaleId}, ${t.sourceTransactionId}) >= 1`
    ),
    check("vat_output_period_month_check", sql`${t.outputPeriodMonth} >= 1 AND ${t.outputPeriodMonth} <= 12`),
    check("vat_output_status_links_check", sql`
      (${t.status} <> 'allocated_to_draft' OR ${t.draftFilingId} IS NOT NULL)
      AND (${t.status} <> 'filed' OR ${t.filedFilingLineId} IS NOT NULL)
    `),
  ]
);

export const pp36Obligations = pgTable(
  "pp36_obligations",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id").references(() => establishments.id),
    taxTreatmentDecisionId: uuid("tax_treatment_decision_id").references(
      () => taxTreatmentDecisions.id
    ),
    sourceDocumentId: uuid("source_document_id").references(() => documents.id),
    sourceDocumentLineId: uuid("source_document_line_id").references(
      () => documentLineItems.id
    ),
    sourcePaymentTransactionId: uuid("source_payment_transaction_id").references(
      () => transactions.id
    ),
    sourceReconciliationMatchId: uuid("source_reconciliation_match_id").references(
      () => reconciliationMatches.id
    ),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    vendorCountryCode: text("vendor_country_code").notNull(),
    serviceDescription: text("service_description"),
    baseAmountThb: numeric("base_amount_thb", { precision: 14, scale: 2 }).notNull(),
    sourceCurrency: varchar("source_currency", { length: 3 }),
    sourceAmount: numeric("source_amount", { precision: 14, scale: 2 }),
    fxRate: numeric("fx_rate", { precision: 12, scale: 6 }),
    fxRateSource: text("fx_rate_source"),
    fxRateDate: date("fx_rate_date"),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull(),
    vatRate: numeric("vat_rate", { precision: 5, scale: 4 }).notNull(),
    occurredOn: date("occurred_on").notNull(),
    paymentDate: date("payment_date").notNull(),
    taxPointDate: date("tax_point_date").notNull(),
    periodBasis: pp36PeriodBasisEnum("period_basis").notNull(),
    periodRuleVersionId: uuid("period_rule_version_id").references(
      () => taxRuleVersions.id
    ),
    pp36PeriodYear: integer("pp36_period_year").notNull(),
    pp36PeriodMonth: integer("pp36_period_month").notNull(),
    pp36FilingId: uuid("pp36_filing_id").references(
      (): AnyPgColumn => vatFilings.id
    ),
    pp36FilingLineId: uuid("pp36_filing_line_id").references(
      (): AnyPgColumn => vatFilingLines.id
    ),
    pp36PaidAt: timestamp("pp36_paid_at", { withTimezone: true }),
    pp36PaymentTransactionId: uuid("pp36_payment_transaction_id").references(
      () => transactions.id
    ),
    pp30ReclaimEligiblePeriodYear: integer("pp30_reclaim_eligible_period_year"),
    pp30ReclaimEligiblePeriodMonth: integer("pp30_reclaim_eligible_period_month"),
    pp30ReclaimExpiryPeriodYear: integer("pp30_reclaim_expiry_period_year"),
    pp30ReclaimExpiryPeriodMonth: integer("pp30_reclaim_expiry_period_month"),
    pp30ReclaimFilingId: uuid("pp30_reclaim_filing_id").references(
      (): AnyPgColumn => vatFilings.id
    ),
    pp30ReclaimFilingLineId: uuid("pp30_reclaim_filing_line_id").references(
      (): AnyPgColumn => vatFilingLines.id
    ),
    reclaimRuleVersionId: uuid("reclaim_rule_version_id").references(
      () => taxRuleVersions.id
    ),
    status: pp36ObligationStatusEnum("status").notNull().default("needs_review"),
    sourceSnapshot: jsonb("source_snapshot").notNull(),
    sourceSnapshotHash: text("source_snapshot_hash").notNull(),
    snapshotVersion: text("snapshot_version").notNull().default("vat_snapshot_v1"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("pp36_obligations_id_org_uniq").on(t.id, t.orgId),
    index("pp36_obligations_org_period")
      .on(t.orgId, t.pp36PeriodYear, t.pp36PeriodMonth, t.status)
      .where(sql`${t.deletedAt} IS NULL`),
    index("pp36_obligations_reclaim_period")
      .on(t.orgId, t.pp30ReclaimEligiblePeriodYear, t.pp30ReclaimEligiblePeriodMonth, t.status)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("pp36_obligations_source_active")
      .on(t.orgId, t.sourcePaymentTransactionId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.sourcePaymentTransactionId} IS NOT NULL`),
    uniqueIndex("pp36_obligations_source_line_active")
      .on(t.orgId, t.sourceDocumentLineId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.sourceDocumentLineId} IS NOT NULL`),
    uniqueIndex("pp36_obligations_source_document_active")
      .on(t.orgId, t.sourceDocumentId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.sourceDocumentId} IS NOT NULL AND ${t.sourceDocumentLineId} IS NULL`),
    check("pp36_amounts_nonnegative_check", sql`${t.baseAmountThb} >= 0 AND ${t.vatAmount} >= 0 AND (${t.sourceAmount} IS NULL OR ${t.sourceAmount} >= 0)`),
    check("pp36_rate_range_check", sql`${t.vatRate} >= 0 AND ${t.vatRate} <= 1`),
    check("pp36_establishment_null_check", sql`${t.establishmentId} IS NULL`),
    check("pp36_vendor_country_code_check", sql`${t.vendorCountryCode} ~ '^[A-Z]{2}$'`),
    check(
      "pp36_snapshot_hash_check",
      sql`${t.sourceSnapshotHash} ~ '^[0-9a-f]{64}$'`
    ),
    check("pp36_period_month_check", sql`
      ${t.pp36PeriodMonth} >= 1 AND ${t.pp36PeriodMonth} <= 12
      AND (${t.pp30ReclaimEligiblePeriodMonth} IS NULL OR (${t.pp30ReclaimEligiblePeriodMonth} >= 1 AND ${t.pp30ReclaimEligiblePeriodMonth} <= 12))
      AND (${t.pp30ReclaimExpiryPeriodMonth} IS NULL OR (${t.pp30ReclaimExpiryPeriodMonth} >= 1 AND ${t.pp30ReclaimExpiryPeriodMonth} <= 12))
    `),
    check("pp36_period_matches_tax_point_check", sql`
      ${t.pp36PeriodYear} = EXTRACT(YEAR FROM ${t.taxPointDate})::integer
      AND ${t.pp36PeriodMonth} = EXTRACT(MONTH FROM ${t.taxPointDate})::integer
    `),
    check("pp36_reclaim_requires_paid_check", sql`
      (
        ${t.status} NOT IN ('eligible_for_pp30_reclaim', 'reclaimed_in_pp30')
        AND ${t.pp30ReclaimFilingId} IS NULL
        AND ${t.pp30ReclaimFilingLineId} IS NULL
      )
      OR (
        ${t.status} = 'eligible_for_pp30_reclaim'
        AND ${t.pp36PaidAt} IS NOT NULL
        AND ${t.pp36FilingId} IS NOT NULL
        AND ${t.pp36FilingLineId} IS NOT NULL
        AND ${t.pp30ReclaimFilingId} IS NULL
        AND ${t.pp30ReclaimFilingLineId} IS NULL
      )
      OR (
        ${t.status} = 'reclaimed_in_pp30'
        AND ${t.pp36PaidAt} IS NOT NULL
        AND ${t.pp36FilingId} IS NOT NULL
        AND ${t.pp36FilingLineId} IS NOT NULL
        AND ${t.pp30ReclaimFilingId} IS NOT NULL
        AND ${t.pp30ReclaimFilingLineId} IS NOT NULL
      )
    `),
    check("pp36_status_links_check", sql`
      (
        ${t.status} NOT IN (
          'allocated_to_draft_pp36',
          'pp36_filed',
          'pp36_paid',
          'eligible_for_pp30_reclaim',
          'reclaimed_in_pp30'
        )
        OR (${t.pp36FilingId} IS NOT NULL AND ${t.pp36FilingLineId} IS NOT NULL)
      )
      AND (
        ${t.status} NOT IN ('pp36_paid', 'eligible_for_pp30_reclaim', 'reclaimed_in_pp30')
        OR ${t.pp36PaidAt} IS NOT NULL
      )
    `),
  ]
);

export const vatFilings = pgTable(
  "vat_filings",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id").references(() => establishments.id),
    filingType: vatFilingTypeEnum("filing_type").notNull(),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    filingKind: vatFilingKindEnum("filing_kind").notNull(),
    version: integer("version").notNull().default(1),
    amendsFilingId: uuid("amends_filing_id").references(
      (): AnyPgColumn => vatFilings.id
    ),
    status: vatFilingStatusEnum("status").notNull().default("draft"),
    outputVatTotal: numeric("output_vat_total", { precision: 14, scale: 2 }),
    inputVatTotal: numeric("input_vat_total", { precision: 14, scale: 2 }),
    pp36VatTotal: numeric("pp36_vat_total", { precision: 14, scale: 2 }),
    pp36ReclaimTotal: numeric("pp36_reclaim_total", { precision: 14, scale: 2 }),
    carryforwardIn: numeric("carryforward_in", { precision: 14, scale: 2 }),
    carryforwardOut: numeric("carryforward_out", { precision: 14, scale: 2 }),
    netPayable: numeric("net_payable", { precision: 14, scale: 2 }),
    filedAt: timestamp("filed_at", { withTimezone: true }),
    filedByUserId: text("filed_by_user_id"),
    paymentStatus: vatPaymentStatusEnum("payment_status")
      .notNull()
      .default("not_required"),
    deadline: date("deadline"),
    refundRequested: boolean("refund_requested").notNull().default(false),
    refundAmount: numeric("refund_amount", { precision: 14, scale: 2 }),
    refundStatus: vatRefundStatusEnum("refund_status"),
    penaltyAmount: numeric("penalty_amount", { precision: 14, scale: 2 }),
    surchargeAmount: numeric("surcharge_amount", { precision: 14, scale: 2 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentTransactionId: uuid("payment_transaction_id").references(
      () => transactions.id
    ),
    rdReceiptNo: text("rd_receipt_no"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("vat_filings_id_org_uniq").on(t.id, t.orgId),
    uniqueIndex("vat_filings_open_ordinary_unique")
      .on(
        t.orgId,
        sql`COALESCE(${t.establishmentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        t.filingType,
        t.periodYear,
        t.periodMonth
      )
      .where(sql`${t.filingKind} = 'ordinary' AND ${t.status} <> 'voided' AND ${t.deletedAt} IS NULL`),
    index("vat_filings_org_period")
      .on(t.orgId, t.filingType, t.periodYear, t.periodMonth, t.status)
      .where(sql`${t.deletedAt} IS NULL`),
    check("vat_filings_period_month_check", sql`${t.periodMonth} >= 1 AND ${t.periodMonth} <= 12`),
    check("vat_filings_version_positive_check", sql`${t.version} >= 1`),
    check("vat_filings_pp30_establishment_check", sql`
      ${t.filingType} <> 'pp30'
      OR ${t.filingKind} <> 'ordinary'
      OR ${t.establishmentId} IS NOT NULL
    `),
    check(
      "vat_filings_refund_requested_amount_check",
      sql`${t.refundRequested} = false OR ${t.refundAmount} > 0`
    ),
    check("vat_filings_amounts_nonnegative_check", sql`
      (${t.outputVatTotal} IS NULL OR ${t.outputVatTotal} >= 0)
      AND (${t.inputVatTotal} IS NULL OR ${t.inputVatTotal} >= 0)
      AND (${t.pp36VatTotal} IS NULL OR ${t.pp36VatTotal} >= 0)
      AND (${t.pp36ReclaimTotal} IS NULL OR ${t.pp36ReclaimTotal} >= 0)
      AND (${t.carryforwardIn} IS NULL OR ${t.carryforwardIn} >= 0)
      AND (${t.carryforwardOut} IS NULL OR ${t.carryforwardOut} >= 0)
      AND (${t.refundAmount} IS NULL OR ${t.refundAmount} >= 0)
      AND (${t.penaltyAmount} IS NULL OR ${t.penaltyAmount} >= 0)
      AND (${t.surchargeAmount} IS NULL OR ${t.surchargeAmount} >= 0)
    `),
  ]
);

export const vatFilingLines = pgTable(
  "vat_filing_lines",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    filingId: uuid("filing_id")
      .notNull()
      .references(() => vatFilings.id),
    lineType: vatFilingLineTypeEnum("line_type").notNull(),
    vatInputItemId: uuid("vat_input_item_id").references(
      (): AnyPgColumn => vatInputItems.id
    ),
    vatOutputItemId: uuid("vat_output_item_id").references(
      (): AnyPgColumn => vatOutputItems.id
    ),
    pp36ObligationId: uuid("pp36_obligation_id").references(
      (): AnyPgColumn => pp36Obligations.id
    ),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull(),
    frozenSnapshotHash: text("frozen_snapshot_hash").notNull(),
    frozenSnapshot: jsonb("frozen_snapshot").notNull(),
    snapshotVersion: text("snapshot_version").notNull().default("vat_snapshot_v1"),
    createdAt,
  },
  (t) => [
    uniqueIndex("vat_filing_lines_id_org_uniq").on(t.id, t.orgId),
    index("vat_filing_lines_filing").on(t.orgId, t.filingId, t.lineType),
    uniqueIndex("vat_filing_lines_input_once")
      .on(t.orgId, t.vatInputItemId, t.lineType)
      .where(sql`${t.vatInputItemId} IS NOT NULL AND ${t.lineType} = 'input'`),
    uniqueIndex("vat_filing_lines_output_once")
      .on(t.orgId, t.vatOutputItemId, t.lineType)
      .where(sql`${t.vatOutputItemId} IS NOT NULL AND ${t.lineType} = 'output'`),
    uniqueIndex("vat_filing_lines_pp36_role_once")
      .on(t.orgId, t.pp36ObligationId, t.lineType)
      .where(sql`${t.pp36ObligationId} IS NOT NULL AND ${t.lineType} IN ('pp36_obligation', 'pp36_reclaim')`),
    check("vat_filing_lines_amounts_nonnegative_check", sql`${t.amount} >= 0 AND ${t.vatAmount} >= 0`),
    check(
      "vat_filing_lines_snapshot_hash_check",
      sql`${t.frozenSnapshotHash} ~ '^[0-9a-f]{64}$'`
    ),
    check("vat_filing_lines_type_source_check", sql`
      (
        ${t.lineType} = 'input'
        AND ${t.vatInputItemId} IS NOT NULL
        AND ${t.vatOutputItemId} IS NULL
        AND ${t.pp36ObligationId} IS NULL
      )
      OR (
        ${t.lineType} = 'output'
        AND ${t.vatInputItemId} IS NULL
        AND ${t.vatOutputItemId} IS NOT NULL
        AND ${t.pp36ObligationId} IS NULL
      )
      OR (
        ${t.lineType} IN ('pp36_obligation', 'pp36_reclaim')
        AND ${t.vatInputItemId} IS NULL
        AND ${t.vatOutputItemId} IS NULL
        AND ${t.pp36ObligationId} IS NOT NULL
      )
      OR (
        ${t.lineType} IN ('carryforward', 'credit_note_adjustment')
        AND ${t.vatInputItemId} IS NULL
        AND ${t.vatOutputItemId} IS NULL
        AND ${t.pp36ObligationId} IS NULL
      )
    `),
  ]
);

export const vatCreditCarryforwards = pgTable(
  "vat_credit_carryforwards",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id").references(() => establishments.id),
    sourcePp30FilingId: uuid("source_pp30_filing_id")
      .notNull()
      .references(() => vatFilings.id),
    sourcePp30FilingLineId: uuid("source_pp30_filing_line_id").references(
      () => vatFilingLines.id
    ),
    creditOriginPeriodYear: integer("credit_origin_period_year").notNull(),
    creditOriginPeriodMonth: integer("credit_origin_period_month").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    remainingAmount: numeric("remaining_amount", { precision: 14, scale: 2 }).notNull(),
    appliedToPp30FilingId: uuid("applied_to_pp30_filing_id").references(
      () => vatFilings.id
    ),
    status: vatCreditCarryforwardStatusEnum("status")
      .notNull()
      .default("available"),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("vat_credit_carryforwards_id_org_uniq").on(t.id, t.orgId),
    uniqueIndex("vat_credit_carryforwards_origin_unique").on(
      t.orgId,
      t.sourcePp30FilingId
    ),
    index("vat_credit_carryforwards_available").on(t.orgId, t.status),
    check("vat_credit_carryforward_period_month_check", sql`${t.creditOriginPeriodMonth} >= 1 AND ${t.creditOriginPeriodMonth} <= 12`),
    check("vat_credit_carryforward_establishment_check", sql`${t.establishmentId} IS NOT NULL`),
    check("vat_credit_carryforward_amount_check", sql`${t.amount} >= 0 AND ${t.remainingAmount} >= 0 AND ${t.remainingAmount} <= ${t.amount}`),
  ]
);

export const taxPaymentEvents = pgTable(
  "tax_payment_events",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    filingId: uuid("filing_id")
      .notNull()
      .references(() => vatFilings.id),
    eventType: taxPaymentEventTypeEnum("event_type").notNull(),
    eventStatus: taxPaymentEventStatusEnum("event_status")
      .notNull()
      .default("recorded"),
    paymentTransactionId: uuid("payment_transaction_id").references(
      () => transactions.id
    ),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    receiptNo: text("receipt_no"),
    evidenceDocumentId: uuid("evidence_document_id").references(() => documents.id),
    idempotencyKey: text("idempotency_key").notNull(),
    postingOutboxStatus: taxPostingOutboxStatusEnum("posting_outbox_status")
      .notNull()
      .default("pending"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt,
  },
  (t) => [
    uniqueIndex("tax_payment_events_id_org_uniq").on(t.id, t.orgId),
    unique("tax_payment_events_idempotency").on(
      t.orgId,
      t.filingId,
      t.idempotencyKey
    ),
    index("tax_payment_events_filing").on(t.orgId, t.filingId),
    check("tax_payment_events_amount_nonnegative_check", sql`${t.amount} >= 0`),
  ]
);

export const periodLocks = pgTable(
  "period_locks",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id"),
    domain: text("domain").notNull(),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month"),
    lockedAt: timestamp("locked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedByUserId: text("locked_by_user_id").notNull(),
    lockReason: text("lock_reason").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
    unlockedByUserId: text("unlocked_by_user_id"),
    unlockReason: text("unlock_reason"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("period_locks_lookup").on(
      t.orgId,
      t.domain,
      t.periodYear,
      t.periodMonth
    ),
  ]
);

export const establishments = pgTable(
  "establishments",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    branchNumber: varchar("branch_number", { length: 7 }).notNull(),
    nameTh: text("name_th"),
    nameEn: text("name_en"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    subdistrict: text("subdistrict"),
    district: text("district"),
    province: text("province"),
    postcode: text("postcode"),
    isHeadOffice: boolean("is_head_office").notNull().default(false),
    requiresManualMapping: boolean("requires_manual_mapping")
      .notNull()
      .default(false),
    consolidatedFilingApproved: boolean("consolidated_filing_approved")
      .notNull()
      .default(false),
    consolidatedUnderBranchId: uuid("consolidated_under_branch_id").references(
      (): AnyPgColumn => establishments.id
    ),
    vatRegistered: boolean("vat_registered").notNull().default(true),
    taxId: text("tax_id"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("establishments_id_org_uniq").on(t.id, t.orgId),
    unique("establishments_org_branch_uniq").on(t.orgId, t.branchNumber),
    index("establishments_org_idx").on(t.orgId),
    check(
      "establishments_branch_number_check",
      sql`${t.branchNumber} ~ '^(00000|[0-9]{5}|UNKNOWN)$'`
    ),
  ]
);

export const salesTransactions = pgTable(
  "sales_transactions",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    eventRole: text("event_role").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
    channel: text("channel").notNull(),
    pricingMode: text("pricing_mode").notNull(),
    amountIncludingVat: numeric("amount_including_vat", {
      precision: 14,
      scale: 2,
    }).notNull(),
    taxBaseExVat: numeric("tax_base_ex_vat", { precision: 14, scale: 2 })
      .notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull(),
    vatRate: numeric("vat_rate", { precision: 5, scale: 4 })
      .notNull()
      // Safety net only — runtime writes resolve the effective-dated rate via
      // getVatRate() (src/lib/db/queries/tax-config.ts).
      .default("0.0700"),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    discountFundedBy: text("discount_funded_by"),
    tipAmount: numeric("tip_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    taxInvoiceType: text("tax_invoice_type"),
    taxInvoiceNumber: text("tax_invoice_number"),
    terminalId: text("terminal_id"),
    supersededById: uuid("superseded_by_id").references(
      (): AnyPgColumn => salesTransactions.id
    ),
    isDeemedSupply: boolean("is_deemed_supply").notNull().default(false),
    deemedSupplyBasis: text("deemed_supply_basis"),
    originalCurrency: text("original_currency"),
    fxRate: numeric("fx_rate", { precision: 18, scale: 8 }),
    fxSource: text("fx_source"),
    payload: jsonb("payload"),
    clearingAccountKey: text("clearing_account_key").notNull(),
    settlementStatus: text("settlement_status").notNull().default("pending"),
    settlementAgedAt: timestamp("settlement_aged_at", { withTimezone: true }),
    settledTransactionId: uuid("settled_transaction_id").references(
      () => transactions.id
    ),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByTerminalUser: text("voided_by_terminal_user"),
    voidReason: text("void_reason"),
    creditNoteForId: uuid("credit_note_for_id").references(
      (): AnyPgColumn => salesTransactions.id
    ),
    creditNoteReason: text("credit_note_reason"),
    isVoucherRedemption: boolean("is_voucher_redemption")
      .notNull()
      .default(false),
    notes: text("notes"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("sales_transactions_id_org_uniq").on(t.id, t.orgId),
    unique("sales_transactions_source_external_uniq").on(
      t.orgId,
      t.source,
      t.externalId
    ),
    uniqueIndex("sales_transactions_tax_invoice_active_uniq")
      .on(t.orgId, t.establishmentId, t.terminalId, t.taxInvoiceNumber)
      .where(sql`${t.taxInvoiceNumber} IS NOT NULL AND ${t.supersededById} IS NULL`),
    index("sales_transactions_sold_at_idx").on(
      t.orgId,
      t.establishmentId,
      t.soldAt
    ),
    index("sales_transactions_clearing_idx").on(
      t.orgId,
      t.clearingAccountKey,
      t.settlementStatus
    ),
    index("sales_transactions_event_role_idx").on(t.orgId, t.eventRole, t.soldAt),
    check(
      "sales_transactions_event_role_check",
      sql`${t.eventRole} IN ('pos_primary', 'processor_shadow')`
    ),
    check(
      "sales_transactions_pricing_mode_check",
      sql`${t.pricingMode} IN ('vat_inclusive', 'vat_exclusive')`
    ),
    check(
      "sales_transactions_pos_primary_invoice_check",
      sql`${t.eventRole} <> 'pos_primary' OR ${t.taxInvoiceType} IS NOT NULL`
    ),
    check(
      "sales_transactions_amounts_nonnegative_check",
      sql`${t.amountIncludingVat} >= 0 AND ${t.taxBaseExVat} >= 0 AND ${t.vatAmount} >= 0`
    ),
  ]
);

/**
 * A merchant payout as the processor reports it: `gross - fee - feeVat = netPayout`.
 *
 * A settlement is evidence that a bank deposit is explained, never an income
 * figure. The VAT base for output VAT is the gross sale price recorded at the
 * point of sale, NOT `netPayout` — a THB 1,070 card sale that deposits THB
 * 1,047.10 still owes output VAT on THB 1,070. Treating settlement-net as the
 * VAT base under-reports output VAT and is a compliance defect. Nothing may
 * wire `netPayout` into an output-VAT path.
 *
 * `feeVatAmount` is only claimable as input VAT once the processor's own tax
 * invoice is captured; the `fee_vat_document` CHECK below enforces that.
 *
 * `bankTransactionId` / `reconciliationStatus` are written by the settlement
 * matcher (leg A: settlement -> bank deposit). Linking individual sales to a
 * settlement batch (leg B) is deferred with POS ingest — see
 * docs/deferred-features.md.
 */
export const processorSettlements = pgTable(
  "processor_settlements",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id").references(() => establishments.id),
    processor: text("processor").notNull(),
    externalId: text("external_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 14, scale: 2 }).notNull(),
    feeVatAmount: numeric("fee_vat_amount", { precision: 14, scale: 2 }),
    netPayout: numeric("net_payout", { precision: 14, scale: 2 }).notNull(),
    processorTaxInvoiceDocumentId: uuid(
      "processor_tax_invoice_document_id"
    ).references(() => documents.id),
    processorTiReceivedAt: timestamp("processor_ti_received_at", {
      withTimezone: true,
    }),
    processorTiNumber: text("processor_ti_number"),
    bankTransactionId: uuid("bank_transaction_id").references(() => transactions.id),
    payload: jsonb("payload"),
    reconciliationStatus: text("reconciliation_status")
      .notNull()
      .default("unreconciled"),
    reconciliationDiscrepancy: numeric("reconciliation_discrepancy", {
      precision: 14,
      scale: 2,
    }),
    // Why the matcher picked this deposit. A payout queue that shows a 0.70
    // suggestion with no reason is not reviewable, so the evidence is stored
    // rather than reconstructed. Shape is `MatchMetadata` from
    // src/lib/reconciliation/matcher.ts, so match-display.ts renders settlement
    // matches and document matches with the same helpers.
    matchConfidence: numeric("match_confidence", { precision: 5, scale: 4 }),
    // Plain `json`, unlike reconciliation_matches.match_metadata (jsonb):
    // this column is new 2026-08 work on an unapplied migration, so it takes
    // the Portable SQL Contract type now. Nothing queries it with jsonb
    // operators — settlements deliberately stay out of getMatchRateByLayer.
    matchMetadata: json("match_metadata"),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("processor_settlements_source_external_uniq").on(
      t.orgId,
      t.processor,
      t.externalId
    ),
    index("processor_settlements_org_status_idx").on(
      t.orgId,
      t.reconciliationStatus
    ),
    check(
      "processor_settlements_fee_vat_document_check",
      sql`${t.feeVatAmount} IS NULL OR ${t.feeVatAmount} = 0 OR ${t.processorTaxInvoiceDocumentId} IS NOT NULL`
    ),
  ]
);


/**
 * The column mapping an owner chose for a processor's settlement CSV, so the
 * second import of the same report is a straight upload with nothing to map.
 *
 * One row per (org, processor); re-mapping overwrites. The stored shape is
 * `SettlementColumnMapping` from src/lib/parsers/settlement-csv.ts — keep the
 * two in step, and treat a stored mapping whose columns are absent from a new
 * file as a prompt to re-map rather than an error.
 */
export const settlementImportMappings = pgTable(
  "settlement_import_mappings",
  {
    // New table (2026-08), so the Portable SQL Contract binds it: the id is
    // app-generated UUIDv7 text with no DB default, and the payload is plain
    // `json`, not `jsonb`. Older tables keep the shared uuid `id` helper —
    // they predate the contract and re-key opportunistically, not here.
    // The org FK stays as belt-and-braces only; nothing relies on it.
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    processor: text("processor").notNull(),
    mapping: json("mapping").notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("settlement_import_mappings_org_processor_uniq").on(
      t.orgId,
      t.processor
    ),
  ]
);

// ---------------------------------------------------------------------------
// System Tables
// ---------------------------------------------------------------------------

export const taxConfig = pgTable(
  "tax_config",
  {
    id,
    key: text("key").notNull(),
    value: text("value").notNull(),
    description: text("description"),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    createdAt,
    updatedAt,
    // NO deletedAt — config managed via effective dates
  },
  // Effective-dated: one row per (key, effectiveFrom) window so rate history
  // survives changes (e.g. the 7% VAT window ending 2026-09-30) and
  // back-period filings can resolve the rate that applied at the time.
  (t) => [unique("tax_config_key_effective_from").on(t.key, t.effectiveFrom)]
);

export const exceptionQueue = pgTable(
  "exception_queue",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    exceptionType: text("exception_type").notNull(),
    severity: text("severity").notNull(),
    summary: text("summary").notNull(),
    payload: jsonb("payload"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
    createdAt,
  },
  (t) => [
    index("exception_queue_org_created").on(t.orgId, t.createdAt),
    index("exception_queue_org_type").on(t.orgId, t.exceptionType),
    uniqueIndex("exception_queue_open_unique")
      .on(t.orgId, t.entityType, t.entityId, t.exceptionType)
      .where(sql`${t.resolvedAt} IS NULL`),
  ]
);

export const whtAnnualThresholdDecisions = pgTable(
  "wht_annual_threshold_decisions",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    payeeVendorId: uuid("payee_vendor_id")
      .notNull()
      .references(() => vendors.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    lineItemId: uuid("line_item_id").references(() => documentLineItems.id),
    certificateId: uuid("certificate_id").references(() => whtCertificates.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    taxYear: integer("tax_year").notNull(),
    eligibleBaseAmount: numeric("eligible_base_amount", {
      precision: 14,
      scale: 2,
    }).notNull(),
    whtRate: numeric("wht_rate", { precision: 5, scale: 4 }).notNull(),
    whtAmount: numeric("wht_amount", { precision: 14, scale: 2 }).notNull(),
    thresholdStatus: text("threshold_status").notNull(),
    createdAt,
  },
  (t) => [
    index("wht_threshold_org_payee_year").on(
      t.orgId,
      t.payeeVendorId,
      t.taxYear
    ),
    unique("wht_threshold_line_payment_unique").on(
      t.orgId,
      t.lineItemId,
      t.paymentId
    ),
  ]
);

export const whtCreditsReceived = pgTable(
  "wht_credits_received",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    customerVendorId: uuid("customer_vendor_id")
      .notNull()
      .references(() => vendors.id),
    certificateReceivedDocumentId: uuid(
      "certificate_received_document_id"
    ).references(() => documents.id),
    paymentDate: date("payment_date").notNull(),
    grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
    whtAmount: numeric("wht_amount", { precision: 14, scale: 2 }).notNull(),
    formType: text("form_type").notNull(),
    taxYear: integer("tax_year").notNull(),
    certificateNo: text("certificate_no"),
    notes: text("notes"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("wht_credits_received_org_year").on(t.orgId, t.taxYear),
    index("wht_credits_received_customer").on(t.orgId, t.customerVendorId),
    uniqueIndex("wht_credits_received_unique_doc")
      .on(t.orgId, t.certificateReceivedDocumentId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.certificateReceivedDocumentId} IS NOT NULL`),
    uniqueIndex("wht_credits_received_unique_cert")
      .on(t.orgId, t.customerVendorId, t.certificateNo, t.taxYear)
      .where(sql`${t.deletedAt} IS NULL AND ${t.certificateNo} IS NOT NULL`),
    check(
      "wht_credits_received_wht_not_above_gross_check",
      sql`${t.whtAmount} <= ${t.grossAmount}`
    ),
  ]
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: auditActionEnum("action").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt,
    // NO updatedAt — audit log rows are immutable
    // NO deletedAt — audit log rows must never be deleted
  },
  (t) => [
    primaryKey({ name: "audit_log_pkey", columns: [t.id, t.createdAt] }),
    index("audit_log_org_created").on(t.orgId, t.createdAt),
    index("audit_log_entity_history").on(
      t.orgId,
      t.entityType,
      t.entityId,
      t.createdAt
    ),
  ]
);

// ---------------------------------------------------------------------------
// AI Settings
// ---------------------------------------------------------------------------

export const orgAiSettings = pgTable(
  "org_ai_settings",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    extractionModel: text("extraction_model"),
    classificationModel: text("classification_model"),
    translationModel: text("translation_model"),
    monthlyBudgetUsd: numeric("monthly_budget_usd", { precision: 8, scale: 2 }),
    budgetAlertThreshold: numeric("budget_alert_threshold", {
      precision: 3,
      scale: 2,
    }).default("0.80"),
    reconciliationBudgetUsd: numeric("reconciliation_budget_usd", { precision: 8, scale: 2 }),
    reconciliationModel: text("reconciliation_model"),
    createdAt,
    updatedAt,
  },
  (t) => [unique("org_ai_settings_org_id").on(t.orgId)]
);

// ---------------------------------------------------------------------------
// AI Match Suggestions
// ---------------------------------------------------------------------------

export const aiMatchSuggestions = pgTable(
  "ai_match_suggestions",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    suggestedAmount: numeric("suggested_amount", { precision: 14, scale: 2 }),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    explanation: text("explanation"),
    aiModelUsed: text("ai_model_used"),
    aiCostUsd: numeric("ai_cost_usd", { precision: 8, scale: 6 }),
    status: text("status").notNull().default("pending"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    rejectionReason: text("rejection_reason"),
    batchId: text("batch_id"),
    createdAt,
    deletedAt,
  },
  (t) => [
    unique("ai_suggestion_txn_doc").on(t.transactionId, t.documentId),
    index("ai_suggestions_org_status").on(t.orgId, t.status),
  ]
);

// ---------------------------------------------------------------------------
// Reconciliation Learning Tables
// ---------------------------------------------------------------------------

export const vendorBankAliases = pgTable(
  "vendor_bank_aliases",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    aliasText: text("alias_text").notNull(),
    aliasType: text("alias_type").notNull().default("counterparty"),
    matchCount: integer("match_count").notNull().default(1),
    isConfirmed: boolean("is_confirmed").notNull().default(false),
    source: text("source").notNull().default("auto_learn"),
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    unique("vendor_alias_org_text").on(t.orgId, t.aliasText, t.aliasType),
    index("vendor_alias_lookup").on(t.orgId, t.aliasText),
  ]
);

export const reconciliationRules = pgTable(
  "reconciliation_rules",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    priority: integer("priority").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    isAutoSuggested: boolean("is_auto_suggested").notNull().default(false),
    conditions: jsonb("conditions").notNull(),
    actions: jsonb("actions").notNull(),
    matchCount: integer("match_count").notNull().default(0),
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),
    templateId: text("template_id"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("recon_rules_org_active").on(t.orgId, t.priority),
  ]
);

export const aiBatchRuns = pgTable(
  "ai_batch_runs",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    triggerType: text("trigger_type").notNull(), // "manual" | "cron"
    triggeredBy: uuid("triggered_by").references(() => users.id),
    triggeredAt: timestamp("triggered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    status: text("status").notNull().default("triggered"), // "triggered" | "completed" | "failed"
    completedAt: timestamp("completed_at", { withTimezone: true }),
    matchCount: integer("match_count"),
    costUsd: numeric("cost_usd", { precision: 8, scale: 6 }),
  },
  (t) => [
    index("ai_batch_runs_org_trigger").on(t.orgId, t.triggerType, t.triggeredAt),
  ]
);

// NOTE: The migration for this table includes a hand-edited CHECK constraint:
//   (was_corrected = true AND ai_value IS DISTINCT FROM user_value)
//   OR (was_corrected = false AND ai_value IS NOT DISTINCT FROM user_value)
// Do not regenerate the migration without preserving this CHECK.

export const extractionLog = pgTable(
  "extraction_log",
  {
    id,
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    modelUsed: text("model_used"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 12, scale: 8 }),
    latencyMs: integer("latency_ms"),
    inngestIdempotencyKey: text("inngest_idempotency_key").notNull(),
    createdAt,
  },
  (t) => [
    uniqueIndex("idx_extraction_log_idempotency").on(t.inngestIdempotencyKey),
    index("idx_extraction_log_document").on(t.documentId, t.createdAt),
    index("idx_extraction_log_vendor").on(t.vendorId, t.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  memberships: many(orgMemberships),
  vendors: many(vendors),
  bankAccounts: many(bankAccounts),
  documents: many(documents),
  whtCertificates: many(whtCertificates),
  whtMonthlyFilings: many(whtMonthlyFilings),
  auditLog: many(auditLog),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  memberships: many(orgMemberships),
}));

export const orgMembershipsRelations = relations(
  orgMemberships,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [orgMemberships.orgId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [orgMemberships.userId],
      references: [users.id],
    }),
  })
);

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [vendors.orgId],
    references: [organizations.id],
  }),
  whtCertificates: many(whtCertificates),
}));

export const bankAccountsRelations = relations(
  bankAccounts,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [bankAccounts.orgId],
      references: [organizations.id],
    }),
    statements: many(bankStatements),
    transactions: many(transactions),
  })
);

export const bankStatementsRelations = relations(
  bankStatements,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [bankStatements.orgId],
      references: [organizations.id],
    }),
    bankAccount: one(bankAccounts, {
      fields: [bankStatements.bankAccountId],
      references: [bankAccounts.id],
    }),
    transactions: many(transactions),
  })
);

export const transactionsRelations = relations(
  transactions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [transactions.orgId],
      references: [organizations.id],
    }),
    bankAccount: one(bankAccounts, {
      fields: [transactions.bankAccountId],
      references: [bankAccounts.id],
    }),
    statement: one(bankStatements, {
      fields: [transactions.statementId],
      references: [bankStatements.id],
    }),
    reconciliationMatches: many(reconciliationMatches),
  })
);

export const documentsRelations = relations(documents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [documents.orgId],
    references: [organizations.id],
  }),
  vendor: one(vendors, {
    fields: [documents.vendorId],
    references: [vendors.id],
  }),
  relatedDocument: one(documents, {
    fields: [documents.relatedDocumentId],
    references: [documents.id],
    relationName: "relatedDocuments",
  }),
  createdByUser: one(users, {
    fields: [documents.createdBy],
    references: [users.id],
  }),
  lineItems: many(documentLineItems),
  files: many(documentFiles),
  payments: many(payments),
  reconciliationMatches: many(reconciliationMatches),
}));

export const documentLineItemsRelations = relations(
  documentLineItems,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [documentLineItems.orgId],
      references: [organizations.id],
    }),
    document: one(documents, {
      fields: [documentLineItems.documentId],
      references: [documents.id],
    }),
  })
);

export const documentFilesRelations = relations(documentFiles, ({ one }) => ({
  organization: one(organizations, {
    fields: [documentFiles.orgId],
    references: [organizations.id],
  }),
  document: one(documents, {
    fields: [documentFiles.documentId],
    references: [documents.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  organization: one(organizations, {
    fields: [payments.orgId],
    references: [organizations.id],
  }),
  document: one(documents, {
    fields: [payments.documentId],
    references: [documents.id],
  }),
}));

export const reconciliationMatchesRelations = relations(
  reconciliationMatches,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [reconciliationMatches.orgId],
      references: [organizations.id],
    }),
    transaction: one(transactions, {
      fields: [reconciliationMatches.transactionId],
      references: [transactions.id],
    }),
    document: one(documents, {
      fields: [reconciliationMatches.documentId],
      references: [documents.id],
    }),
    payment: one(payments, {
      fields: [reconciliationMatches.paymentId],
      references: [payments.id],
    }),
  })
);

export const whtCertificatesRelations = relations(
  whtCertificates,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [whtCertificates.orgId],
      references: [organizations.id],
    }),
    payeeVendor: one(vendors, {
      fields: [whtCertificates.payeeVendorId],
      references: [vendors.id],
    }),
    filing: one(whtMonthlyFilings, {
      fields: [whtCertificates.filingId],
      references: [whtMonthlyFilings.id],
    }),
    replacementCert: one(whtCertificates, {
      fields: [whtCertificates.replacementCertId],
      references: [whtCertificates.id],
      relationName: "voidReplacementChain",
    }),
    items: many(whtCertificateItems),
  })
);

export const whtCertificateItemsRelations = relations(
  whtCertificateItems,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [whtCertificateItems.orgId],
      references: [organizations.id],
    }),
    certificate: one(whtCertificates, {
      fields: [whtCertificateItems.certificateId],
      references: [whtCertificates.id],
    }),
    document: one(documents, {
      fields: [whtCertificateItems.documentId],
      references: [documents.id],
    }),
    lineItem: one(documentLineItems, {
      fields: [whtCertificateItems.lineItemId],
      references: [documentLineItems.id],
    }),
  })
);

export const whtSequenceCountersRelations = relations(
  whtSequenceCounters,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [whtSequenceCounters.orgId],
      references: [organizations.id],
    }),
  })
);

export const whtMonthlyFilingsRelations = relations(
  whtMonthlyFilings,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [whtMonthlyFilings.orgId],
      references: [organizations.id],
    }),
    certificates: many(whtCertificates),
  })
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLog.orgId],
    references: [organizations.id],
  }),
  actor: one(users, {
    fields: [auditLog.actorId],
    references: [users.id],
  }),
}));

export const orgAiSettingsRelations = relations(orgAiSettings, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgAiSettings.orgId],
    references: [organizations.id],
  }),
}));

export const vendorBankAliasesRelations = relations(
  vendorBankAliases,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [vendorBankAliases.orgId],
      references: [organizations.id],
    }),
    vendor: one(vendors, {
      fields: [vendorBankAliases.vendorId],
      references: [vendors.id],
    }),
  })
);

export const reconciliationRulesRelations = relations(
  reconciliationRules,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [reconciliationRules.orgId],
      references: [organizations.id],
    }),
  })
);

export const aiMatchSuggestionsRelations = relations(
  aiMatchSuggestions,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [aiMatchSuggestions.orgId],
      references: [organizations.id],
    }),
    transaction: one(transactions, {
      fields: [aiMatchSuggestions.transactionId],
      references: [transactions.id],
    }),
    document: one(documents, {
      fields: [aiMatchSuggestions.documentId],
      references: [documents.id],
    }),
    payment: one(payments, {
      fields: [aiMatchSuggestions.paymentId],
      references: [payments.id],
    }),
    reviewer: one(users, {
      fields: [aiMatchSuggestions.reviewedBy],
      references: [users.id],
    }),
  })
);

// ---------------------------------------------------------------------------
// Extraction Learning Loop Relations
// ---------------------------------------------------------------------------

export const extractionLogRelations = relations(
  extractionLog,
  ({ one }) => ({
    document: one(documents, {
      fields: [extractionLog.documentId],
      references: [documents.id],
    }),
    organization: one(organizations, {
      fields: [extractionLog.orgId],
      references: [organizations.id],
    }),
    vendor: one(vendors, {
      fields: [extractionLog.vendorId],
      references: [vendors.id],
    }),
  })
);
