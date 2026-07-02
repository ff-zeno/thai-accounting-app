import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  smallint,
  numeric,
  date,
  timestamp,
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

export const glAccountTypeEnum = pgEnum("gl_account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
  "cogs",
  "contra_asset",
  "contra_liability",
]);

export const glEntryTypeEnum = pgEnum("gl_entry_type", [
  "manual",
  "opening_balance",
  "memo",
  "auto_document",
  "auto_sales",
  "auto_payment",
  "auto_payroll",
  "auto_fx_revaluation",
  "auto_depreciation",
  "auto_fixed_asset_disposal",
  "auto_accrual",
  "auto_year_end_close",
  "auto_pp30_settlement",
]);

export const postingKindEnum = pgEnum("posting_kind", [
  "processor_settlement",
  "cash_deposit",
  "fx_revaluation",
  "year_end_close_revenue_summary",
  "year_end_close_to_retained_earnings",
  "cit_accrual",
  "cit_payment",
  "manual_pair",
  "manual_reversal",
  "opening_balance_pair",
  "pos_primary_sale",
  "tax_payment_pp30",
  "tax_payment_pp36",
  "vat_pp36_self_assessment",
  "vat_pp36_reclaim_transfer",
  "wht_credit_received",
  "import_broker_invoice",
  "import_payment_clearing",
  "inventory_cogs",
  "inventory_sale_cogs",
  "inventory_count_variance",
  "inventory_purchase",
  "payroll_accrual",
  "payroll_net_payment",
  "payroll_pnd1_remittance",
  "payroll_sso_remittance",
  "depreciation",
  "fixed_asset_disposal",
]);

export const glTaxTreatmentEnum = pgEnum("gl_tax_treatment", [
  "taxable_revenue",
  "vat_exempt_revenue",
  "zero_rated_revenue",
  "non_deductible_expense",
  "vat_recoverable_input",
  "non_recoverable_input",
  "n_a",
]);

export const glVatRegisterRoleEnum = pgEnum("gl_vat_register_role", [
  "output_tax_payable",
  "input_tax_recoverable",
  "pp36_payable",
  "pp36_reclaim",
  "n_a",
]);

export const glWhtRegisterRoleEnum = pgEnum("gl_wht_register_role", [
  "wht_payable_pnd1",
  "wht_payable_pnd3",
  "wht_payable_pnd53",
  "wht_payable_pnd54",
  "wht_credits_receivable",
  "n_a",
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

export const glAccounts = pgTable(
  "gl_accounts",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id"),
    accountCode: text("account_code").notNull(),
    nameTh: text("name_th").notNull(),
    nameEn: text("name_en").notNull(),
    accountType: glAccountTypeEnum("account_type").notNull(),
    accountSubtype: text("account_subtype"),
    parentAccountId: uuid("parent_account_id").references(
      (): AnyPgColumn => glAccounts.id
    ),
    isClearing: boolean("is_clearing").notNull().default(false),
    isControlAccount: boolean("is_control_account").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false),
    isAutomated: boolean("is_automated").notNull().default(false),
    isPostable: boolean("is_postable").notNull().default(true),
    descriptionOverrideEn: text("description_override_en"),
    descriptionOverrideTh: text("description_override_th"),
    visibilityCondition: text("visibility_condition"),
    dbdTaxonomyHint: text("dbd_taxonomy_hint"),
    tenantAddedBy: uuid("tenant_added_by").references(() => users.id),
    tenantAddedAt: timestamp("tenant_added_at", { withTimezone: true }),
    taxTreatment: glTaxTreatmentEnum("tax_treatment").notNull().default("n_a"),
    boiSegment: text("boi_segment").notNull().default("n_a"),
    vatRegisterRole: glVatRegisterRoleEnum("vat_register_role")
      .notNull()
      .default("n_a"),
    whtRegisterRole: glWhtRegisterRoleEnum("wht_register_role")
      .notNull()
      .default("n_a"),
    notes: text("notes"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("gl_accounts_id_org_uniq").on(t.id, t.orgId),
    unique("gl_accounts_org_code_uniq").on(t.orgId, t.accountCode),
    index("gl_accounts_org_type_idx").on(t.orgId, t.accountType),
    check("gl_accounts_code_format_check", sql`${t.accountCode} ~ '^[1-9][0-9]{3}$'`),
  ]
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id"),
    entryNumber: text("entry_number").notNull(),
    entryDate: date("entry_date").notNull(),
    postingDate: date("posting_date").notNull(),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    entryType: glEntryTypeEnum("entry_type").notNull(),
    postingKind: postingKindEnum("posting_kind"),
    sourceEntityType: text("source_entity_type"),
    sourceEntityId: uuid("source_entity_id"),
    sourceEventId: text("source_event_id"),
    description: text("description").notNull(),
    descriptionTh: text("description_th"),
    currency: text("currency").notNull().default("THB"),
    fxRate: numeric("fx_rate", { precision: 18, scale: 8 }),
    totalDebit: numeric("total_debit", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    totalCredit: numeric("total_credit", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    createdByUserId: text("created_by_user_id"),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isReversal: boolean("is_reversal").notNull().default(false),
    reversesEntryId: uuid("reverses_entry_id").references(
      (): AnyPgColumn => journalEntries.id
    ),
    reversedByEntryId: uuid("reversed_by_entry_id").references(
      (): AnyPgColumn => journalEntries.id
    ),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("journal_entries_id_org_uniq").on(t.id, t.orgId),
    unique("journal_entries_org_number_uniq").on(t.orgId, t.entryNumber),
    uniqueIndex("journal_entries_auto_source_uniq")
      .on(t.orgId, t.sourceEntityType, t.sourceEntityId, t.postingKind)
      .where(sql`${t.sourceEntityType} IS NOT NULL AND ${t.sourceEntityId} IS NOT NULL AND ${t.postingKind} IS NOT NULL AND ${t.reversedByEntryId} IS NULL`),
    index("journal_entries_period_idx").on(t.orgId, t.periodYear, t.periodMonth),
    index("journal_entries_source_idx").on(
      t.orgId,
      t.sourceEntityType,
      t.sourceEntityId
    ),
    check("journal_entries_period_month_check", sql`${t.periodMonth} BETWEEN 1 AND 12`),
    check("journal_entries_balanced_check", sql`${t.totalDebit} = ${t.totalCredit}`),
    check(
      "journal_entries_nonzero_or_documented_check",
      sql`${t.totalDebit} > 0 OR ${t.isReversal} = true OR ${t.entryType} IN ('opening_balance', 'memo') OR ${t.notes} IS NOT NULL`
    ),
  ]
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id),
    lineNumber: integer("line_number").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => glAccounts.id),
    description: text("description"),
    debitAmount: numeric("debit_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    creditAmount: numeric("credit_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    subledgerEntityType: text("subledger_entity_type"),
    subledgerEntityId: uuid("subledger_entity_id"),
    channelKey: text("channel_key"),
    processorKey: text("processor_key"),
    cashDepositKey: text("cash_deposit_key"),
    costCenterId: uuid("cost_center_id"),
    projectId: uuid("project_id"),
    boiSegment: text("boi_segment").notNull().default("n_a"),
    originalCurrency: text("original_currency"),
    originalAmountDebit: numeric("original_amount_debit", {
      precision: 18,
      scale: 2,
    }),
    originalAmountCredit: numeric("original_amount_credit", {
      precision: 18,
      scale: 2,
    }),
    fxRateApplied: numeric("fx_rate_applied", { precision: 18, scale: 8 }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("journal_lines_entry_line_uniq").on(t.journalEntryId, t.lineNumber),
    index("journal_lines_account_idx").on(t.orgId, t.accountId, t.journalEntryId),
    index("journal_lines_subledger_idx").on(
      t.orgId,
      t.subledgerEntityType,
      t.subledgerEntityId
    ),
    check(
      "journal_lines_debit_or_credit_check",
      sql`((${t.debitAmount} > 0 AND ${t.creditAmount} = 0) OR (${t.debitAmount} = 0 AND ${t.creditAmount} > 0))`
    ),
  ]
);

export const postingOutbox = pgTable(
  "posting_outbox",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    sourceEntityType: text("source_entity_type").notNull(),
    sourceEntityId: uuid("source_entity_id").notNull(),
    eventType: text("event_type").notNull(),
    postingDate: date("posting_date"),
    payload: jsonb("payload"),
    postingStatus: text("posting_status").notNull().default("pending"),
    postingAttempts: integer("posting_attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("posting_outbox_source_event_uniq").on(
      t.orgId,
      t.sourceEntityType,
      t.sourceEntityId,
      t.eventType
    ),
    index("posting_outbox_pending_idx").on(
      t.orgId,
      t.postingStatus,
      t.createdAt
    ).where(sql`${t.postingStatus} IN ('pending', 'failed', 'retrying')`),
    check(
      "posting_outbox_status_check",
      sql`${t.postingStatus} IN ('pending', 'posted', 'failed', 'retrying')`
    ),
  ]
);

export const postingExceptions = pgTable(
  "posting_exceptions",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    postingOutboxId: uuid("posting_outbox_id")
      .notNull()
      .references(() => postingOutbox.id),
    sourceEntityType: text("source_entity_type").notNull(),
    sourceEntityId: uuid("source_entity_id").notNull(),
    failureClass: text("failure_class").notNull().default("unknown"),
    message: text("message").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("posting_exceptions_open_outbox_uniq")
      .on(t.orgId, t.postingOutboxId)
      .where(sql`${t.resolvedAt} IS NULL`),
    check(
      "posting_exceptions_failure_class_check",
      sql`${t.failureClass} IN ('unknown', 'unmapped_account', 'invalid_source', 'db_error')`
    ),
  ]
);

export const glOpeningBalances = pgTable(
  "gl_opening_balances",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id"),
    asOfDate: date("as_of_date").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => glAccounts.id),
    debitAmount: numeric("debit_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    creditAmount: numeric("credit_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    enteredByUserId: text("entered_by_user_id"),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("gl_opening_balances_org_account_date_uniq").on(
      t.orgId,
      t.establishmentId,
      t.asOfDate,
      t.accountId
    ),
    check(
      "gl_opening_balances_debit_or_credit_check",
      sql`((${t.debitAmount} > 0 AND ${t.creditAmount} = 0) OR (${t.debitAmount} = 0 AND ${t.creditAmount} > 0) OR (${t.debitAmount} = 0 AND ${t.creditAmount} = 0))`
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
    voucherSalesId: uuid("voucher_sales_id"),
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

export const voucherSales = pgTable(
  "voucher_sales",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
    voucherCode: text("voucher_code").notNull(),
    faceValue: numeric("face_value", { precision: 14, scale: 2 }).notNull(),
    paymentReceived: numeric("payment_received", {
      precision: 14,
      scale: 2,
    }).notNull(),
    expiresAt: date("expires_at"),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    redemptionSalesTransactionId: uuid("redemption_sales_transaction_id").references(
      () => salesTransactions.id
    ),
    payload: jsonb("payload"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    unique("voucher_sales_org_code_uniq").on(t.orgId, t.voucherCode),
    index("voucher_sales_org_establishment_idx").on(t.orgId, t.establishmentId),
    check("voucher_sales_amounts_nonnegative_check", sql`${t.faceValue} >= 0 AND ${t.paymentReceived} >= 0`),
  ]
);

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

export const cashDeposits = pgTable(
  "cash_deposits",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    depositSlipDocumentId: uuid("deposit_slip_document_id").references(
      () => documents.id
    ),
    depositedAt: date("deposited_at").notNull(),
    depositedBy: text("deposited_by"),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    slipReference: text("slip_reference"),
    bankTransactionId: uuid("bank_transaction_id").references(() => transactions.id),
    posCashPeriodStart: date("pos_cash_period_start"),
    posCashPeriodEnd: date("pos_cash_period_end"),
    cashVariance: numeric("cash_variance", { precision: 14, scale: 2 }),
    varianceResolutionStatus: text("variance_resolution_status")
      .notNull()
      .default("open"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("cash_deposits_org_establishment_date_idx").on(
      t.orgId,
      t.establishmentId,
      t.depositedAt
    ),
    check("cash_deposits_amount_nonnegative_check", sql`${t.amount} >= 0`),
  ]
);

export const importPackets = pgTable(
  "imports",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    importReference: text("import_reference"),
    supplierVendorId: uuid("supplier_vendor_id").references(() => vendors.id),
    customsDeclarationNumber: text("customs_declaration_number"),
    arrivalPort: text("arrival_port"),
    arrivalDate: date("arrival_date").notNull(),
    customsClearanceDate: date("customs_clearance_date").notNull(),
    originalCurrency: text("original_currency").notNull(),
    fxRateAtClearance: numeric("fx_rate_at_clearance", {
      precision: 18,
      scale: 8,
    }).notNull(),
    cifOriginal: numeric("cif_original", { precision: 14, scale: 2 }),
    cifThb: numeric("cif_thb", { precision: 14, scale: 2 }),
    customsAssessedDutyThb: numeric("customs_assessed_duty_thb", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    customsAssessedExciseThb: numeric("customs_assessed_excise_thb", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    customsAssessedImportVatThb: numeric("customs_assessed_import_vat_thb", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    isFinalized: boolean("is_finalized").notNull().default(false),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("imports_id_org_uniq").on(t.id, t.orgId),
    unique("imports_org_reference_uniq").on(t.orgId, t.importReference),
    index("imports_org_clearance_idx").on(t.orgId, t.customsClearanceDate),
    check("imports_fx_positive_check", sql`${t.fxRateAtClearance} > 0`),
    check(
      "imports_assessed_amounts_nonnegative_check",
      sql`${t.customsAssessedDutyThb} >= 0 AND ${t.customsAssessedExciseThb} >= 0 AND ${t.customsAssessedImportVatThb} >= 0`
    ),
    check(
      "imports_finalized_at_check",
      sql`${t.isFinalized} = false OR ${t.finalizedAt} IS NOT NULL`
    ),
  ]
);

export const importDocuments = pgTable(
  "import_documents",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    importId: uuid("import_id")
      .notNull()
      .references(() => importPackets.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    documentRole: text("document_role").notNull(),
    notes: text("notes"),
    createdAt,
  },
  (t) => [
    unique("import_documents_unique_doc").on(t.importId, t.documentId),
    index("import_documents_org_import_idx").on(t.orgId, t.importId),
    check(
      "import_documents_role_check",
      sql`${t.documentRole} IN ('foreign_supplier_invoice', 'customs_declaration', 'broker_invoice', 'shipping_invoice', 'insurance_invoice', 'bank_remittance_advice', 'other')`
    ),
  ]
);

export const importGoodsLines = pgTable(
  "import_goods_lines",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    importId: uuid("import_id")
      .notNull()
      .references(() => importPackets.id),
    skuId: uuid("sku_id"),
    skuCode: text("sku_code").notNull(),
    description: text("description"),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    unitPriceOriginal: numeric("unit_price_original", {
      precision: 14,
      scale: 4,
    }).notNull(),
    goodsValueOriginal: numeric("goods_value_original", {
      precision: 14,
      scale: 2,
    }),
    goodsValueThb: numeric("goods_value_thb", { precision: 14, scale: 2 }),
    weightKg: numeric("weight_kg", { precision: 14, scale: 4 }),
    lotSequence: integer("lot_sequence").notNull().default(1),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("import_goods_lines_lot_unique").on(
      t.importId,
      t.skuCode,
      t.lotSequence
    ),
    index("import_goods_lines_org_import_idx").on(t.orgId, t.importId),
    check("import_goods_lines_positive_qty_check", sql`${t.quantity} > 0`),
    check(
      "import_goods_lines_amounts_nonnegative_check",
      sql`${t.unitPriceOriginal} >= 0 AND (${t.goodsValueOriginal} IS NULL OR ${t.goodsValueOriginal} >= 0) AND (${t.goodsValueThb} IS NULL OR ${t.goodsValueThb} >= 0) AND (${t.weightKg} IS NULL OR ${t.weightKg} >= 0)`
    ),
  ]
);

export const importChargeLines = pgTable(
  "import_charge_lines",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    importId: uuid("import_id")
      .notNull()
      .references(() => importPackets.id),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => documents.id),
    lineDescription: text("line_description").notNull(),
    amountThb: numeric("amount_thb", { precision: 14, scale: 2 }).notNull(),
    originalCurrency: text("original_currency").notNull().default("THB"),
    originalAmount: numeric("original_amount", { precision: 14, scale: 2 })
      .notNull(),
    fxRateApplied: numeric("fx_rate_applied", { precision: 18, scale: 8 }),
    fxSource: text("fx_source"),
    fxDate: date("fx_date"),
    vatTreatment: text("vat_treatment").notNull(),
    vatAmountThb: numeric("vat_amount_thb", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    expenseAccountId: uuid("expense_account_id").references(() => glAccounts.id),
    vatPeriodOverride: text("vat_period_override"),
    lateClaimReason: text("late_claim_reason"),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("import_charge_lines_import_doc_idx").on(t.importId, t.sourceDocumentId),
    index("import_charge_lines_treatment_idx").on(t.importId, t.vatTreatment),
    uniqueIndex("import_charge_lines_import_vat_per_doc_uniq")
      .on(t.importId, t.sourceDocumentId)
      .where(sql`${t.vatTreatment} = 'is_import_vat'`),
    check(
      "import_charge_lines_treatment_check",
      sql`${t.vatTreatment} IN ('service_with_vat_pct', 'service_with_vat_zero', 'service_vat_exempt', 'is_import_vat', 'is_pass_through', 'excise_pass_through')`
    ),
    check(
      "import_charge_lines_amount_nonnegative_check",
      sql`${t.amountThb} >= 0 AND ${t.originalAmount} >= 0 AND ${t.vatAmountThb} >= 0`
    ),
    check(
      "import_charge_lines_fx_positive_check",
      sql`${t.fxRateApplied} IS NULL OR ${t.fxRateApplied} > 0`
    ),
    check(
      "import_charge_lines_import_vat_override_check",
      sql`${t.vatTreatment} <> 'is_import_vat' OR (${t.vatPeriodOverride} IS NOT NULL AND ${t.vatPeriodOverride} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND ${t.expenseAccountId} IS NULL)`
    ),
  ]
);

export const importPayments = pgTable(
  "import_payments",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    importId: uuid("import_id")
      .notNull()
      .references(() => importPackets.id),
    bankTransactionId: uuid("bank_transaction_id")
      .notNull()
      .references(() => transactions.id),
    paymentRole: text("payment_role").notNull(),
    amountThb: numeric("amount_thb", { precision: 14, scale: 2 }).notNull(),
    createdAt,
  },
  (t) => [
    index("import_payments_role_idx").on(t.importId, t.paymentRole),
    uniqueIndex("import_payments_org_bank_transaction_uniq").on(
      t.orgId,
      t.bankTransactionId
    ),
    check(
      "import_payments_role_check",
      sql`${t.paymentRole} IN ('foreign_supplier_payment', 'broker_settlement', 'shipper_settlement', 'customs_direct_payment')`
    ),
    check("import_payments_amount_nonnegative_check", sql`${t.amountThb} >= 0`),
  ]
);

export const skus = pgTable(
  "skus",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id").references(() => establishments.id),
    skuCode: text("sku_code").notNull(),
    barcodeEan13: text("barcode_ean13"),
    nameTh: text("name_th"),
    nameEn: text("name_en"),
    description: text("description"),
    category: text("category"),
    valuationMethod: text("valuation_method")
      .notNull()
      .default("weighted_average"),
    unitOfMeasure: text("unit_of_measure").notNull().default("pcs"),
    currentQuantity: numeric("current_quantity", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    currentAvgCost: numeric("current_avg_cost", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    lastKnownAvgCost: numeric("last_known_avg_cost", {
      precision: 14,
      scale: 4,
    }),
    standardCost: numeric("standard_cost", { precision: 14, scale: 4 }),
    reorderPointQuantity: numeric("reorder_point_quantity", {
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default("0"),
    currentValue: numeric("current_value", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    lastMovementAt: timestamp("last_movement_at", { withTimezone: true }),
    isInventoriable: boolean("is_inventoriable").notNull().default(true),
    glInventoryAccountId: uuid("gl_inventory_account_id").references(
      () => glAccounts.id
    ),
    glCogsAccountId: uuid("gl_cogs_account_id").references(() => glAccounts.id),
    glRevenueAccountId: uuid("gl_revenue_account_id").references(
      () => glAccounts.id
    ),
    notes: text("notes"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    unique("skus_org_code_uniq").on(t.orgId, t.skuCode),
    index("skus_org_establishment_idx").on(t.orgId, t.establishmentId),
    check(
      "skus_valuation_method_check",
      sql`${t.valuationMethod} IN ('weighted_average', 'fifo', 'specific_identification')`
    ),
    check(
      "skus_costs_nonnegative_check",
      sql`${t.currentAvgCost} >= 0 AND (${t.lastKnownAvgCost} IS NULL OR ${t.lastKnownAvgCost} >= 0) AND (${t.standardCost} IS NULL OR ${t.standardCost} >= 0)`
    ),
    check(
      "skus_reorder_point_nonnegative_check",
      sql`${t.reorderPointQuantity} >= 0`
    ),
  ]
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    skuId: uuid("sku_id")
      .notNull()
      .references(() => skus.id),
    movementAt: timestamp("movement_at", { withTimezone: true }).notNull(),
    movementType: text("movement_type").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4 }),
    totalCost: numeric("total_cost", { precision: 14, scale: 2 }).notNull(),
    runningQuantityAfter: numeric("running_quantity_after", {
      precision: 14,
      scale: 4,
    }),
    runningAvgCostAfter: numeric("running_avg_cost_after", {
      precision: 14,
      scale: 4,
    }),
    runningValueAfter: numeric("running_value_after", {
      precision: 14,
      scale: 2,
    }),
    sourceEntityType: text("source_entity_type"),
    sourceEntityId: uuid("source_entity_id"),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
    notes: text("notes"),
    createdAt,
    deletedAt,
  },
  (t) => [
    index("inventory_movements_sku_history_idx").on(
      t.orgId,
      t.skuId,
      t.movementAt
    ),
    index("inventory_movements_source_idx").on(
      t.orgId,
      t.sourceEntityType,
      t.sourceEntityId
    ),
    uniqueIndex("inventory_movements_document_purchase_uniq")
      .on(t.orgId, t.sourceEntityType, t.sourceEntityId, t.skuId, t.movementType)
      .where(
        sql`${t.deletedAt} IS NULL AND ${t.sourceEntityType} = 'documents' AND ${t.movementType} = 'purchase_in'`
      ),
    check(
      "inventory_movements_type_check",
      sql`${t.movementType} IN ('purchase_in', 'import_in', 'sale_out', 'return_in', 'return_out', 'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out', 'count_variance_in', 'count_variance_out', 'shrinkage', 'revaluation')`
    ),
    check(
      "inventory_movements_sign_check",
      sql`(${t.movementType} IN ('purchase_in', 'import_in', 'return_in', 'adjustment_in', 'transfer_in', 'count_variance_in') AND ${t.quantity} > 0)
        OR (${t.movementType} IN ('sale_out', 'return_out', 'adjustment_out', 'transfer_out', 'count_variance_out', 'shrinkage') AND ${t.quantity} < 0)
        OR (${t.movementType} = 'revaluation' AND ${t.quantity} = 0)`
    ),
    check(
      "inventory_movements_costs_nonnegative_check",
      sql`(${t.unitCost} IS NULL OR ${t.unitCost} >= 0) AND ${t.totalCost} >= 0`
    ),
  ]
);

export const inventoryCounts = pgTable(
  "inventory_counts",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    countDate: date("count_date").notNull(),
    countType: text("count_type").notNull().default("cycle"),
    status: text("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledByUserId: text("reconciled_by_user_id"),
    totalVarianceValueThb: numeric("total_variance_value_thb", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("inventory_counts_org_date_idx").on(t.orgId, t.countDate),
    check("inventory_counts_type_check", sql`${t.countType} IN ('full', 'cycle', 'spot')`),
    check(
      "inventory_counts_status_check",
      sql`${t.status} IN ('draft', 'submitted', 'reconciled')`
    ),
  ]
);

export const inventoryCountItems = pgTable(
  "inventory_count_items",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    countId: uuid("count_id")
      .notNull()
      .references(() => inventoryCounts.id),
    skuId: uuid("sku_id")
      .notNull()
      .references(() => skus.id),
    systemQuantity: numeric("system_quantity", {
      precision: 14,
      scale: 4,
    }).notNull(),
    countedQuantity: numeric("counted_quantity", {
      precision: 14,
      scale: 4,
    }).notNull(),
    variance: numeric("variance", { precision: 14, scale: 4 }).notNull(),
    varianceValueThb: numeric("variance_value_thb", {
      precision: 14,
      scale: 2,
    }).notNull(),
    varianceReason: text("variance_reason"),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("inventory_count_items_count_sku_uniq").on(t.countId, t.skuId),
    index("inventory_count_items_org_count_idx").on(t.orgId, t.countId),
    check(
      "inventory_count_items_reason_check",
      sql`${t.varianceReason} IS NULL OR ${t.varianceReason} IN ('shrinkage', 'damage', 'count_error', 'unrecorded_sale', 'other')`
    ),
  ]
);

export const inventoryStatutoryOverheadComponents = pgTable(
  "inventory_statutory_overhead_components",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    importId: uuid("import_id")
      .notNull()
      .references(() => importPackets.id),
    importGoodsLineId: uuid("import_goods_line_id").references(
      () => importGoodsLines.id
    ),
    importChargeLineId: uuid("import_charge_line_id").references(
      () => importChargeLines.id
    ),
    skuId: uuid("sku_id")
      .notNull()
      .references(() => skus.id),
    componentType: text("component_type").notNull(),
    componentAmountThb: numeric("component_amount_thb", {
      precision: 14,
      scale: 2,
    }).notNull(),
    remainingAmountThb: numeric("remaining_amount_thb", {
      precision: 14,
      scale: 2,
    }).notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("inventory_overhead_components_import_idx").on(t.orgId, t.importId),
    index("inventory_overhead_components_sku_year_idx").on(
      t.orgId,
      t.skuId,
      t.fiscalYear
    ),
    check(
      "inventory_overhead_components_type_check",
      sql`${t.componentType} IN ('customs_duty', 'excise', 'freight', 'insurance', 'brokerage', 'non_recoverable_tax', 'other')`
    ),
    check(
      "inventory_overhead_components_amount_check",
      sql`${t.componentAmountThb} >= 0 AND ${t.remainingAmountThb} >= 0 AND ${t.remainingAmountThb} <= ${t.componentAmountThb}`
    ),
  ]
);

export const employees = pgTable(
  "employees",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    nationalId: text("national_id"),
    passportNumber: text("passport_number"),
    taxId: text("tax_id"),
    fullNameTh: text("full_name_th"),
    fullNameEn: text("full_name_en"),
    dob: date("dob"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    position: text("position"),
    baseMonthlySalary: numeric("base_monthly_salary", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    salaryEffectiveFrom: date("salary_effective_from"),
    payFrequency: text("pay_frequency").notNull().default("monthly"),
    payPeriodsPerYear: integer("pay_periods_per_year").notNull().default(12),
    bankAccountNumber: text("bank_account_number"),
    bankAccountName: text("bank_account_name"),
    bankCode: text("bank_code"),
    providentFundEligible: boolean("provident_fund_eligible")
      .notNull()
      .default(false),
    socialSecurityEligible: boolean("social_security_eligible")
      .notNull()
      .default(true),
    socialSecurityFirstRegisteredAt: date("social_security_first_registered_at"),
    isDirector: boolean("is_director").notNull().default(false),
    priorEmployerYtdGross: numeric("prior_employer_ytd_gross", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    priorEmployerYtdPit: numeric("prior_employer_ytd_pit", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    priorEmployerYtdAsOfMonth: integer("prior_employer_ytd_as_of_month"),
    priorEmployerYnotCertificateDocumentId: uuid(
      "prior_employer_ynot_certificate_document_id"
    ).references(() => documents.id),
    notes: text("notes"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("employees_org_establishment_idx").on(t.orgId, t.establishmentId),
    check(
      "employees_pay_frequency_check",
      sql`${t.payFrequency} IN ('monthly', 'bi_weekly', 'weekly', 'daily')`
    ),
    check("employees_pay_periods_positive_check", sql`${t.payPeriodsPerYear} > 0`),
    check("employees_base_salary_nonnegative_check", sql`${t.baseMonthlySalary} >= 0`),
    check(
      "employees_prior_ytd_nonnegative_check",
      sql`${t.priorEmployerYtdGross} >= 0 AND ${t.priorEmployerYtdPit} >= 0`
    ),
  ]
);

export const employeeAllowances = pgTable(
  "employee_allowances",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    taxYear: integer("tax_year").notNull(),
    personalAllowance: numeric("personal_allowance", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("60000"),
    spouseAllowance: numeric("spouse_allowance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    childCountPre2018: integer("child_count_pre_2018").notNull().default(0),
    childCountPost2018SecondPlus: integer(
      "child_count_post_2018_second_plus"
    )
      .notNull()
      .default(0),
    parentAllowance: numeric("parent_allowance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    disabledDependentAllowance: numeric("disabled_dependent_allowance", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    healthInsurancePremium: numeric("health_insurance_premium", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    lifeInsurancePremium: numeric("life_insurance_premium", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    parentsHealthInsurance: numeric("parents_health_insurance", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    pensionInsurance: numeric("pension_insurance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    providentFundContributionPct: numeric("provident_fund_contribution_pct", {
      precision: 5,
      scale: 4,
    })
      .notNull()
      .default("0"),
    ltfRmfSsfAmount: numeric("ltf_rmf_ssf_amount", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    mortgageInterest: numeric("mortgage_interest", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    socialSecurityContribution: numeric("social_security_contribution", {
      precision: 14,
      scale: 2,
    }),
    submittedByEmployeeAt: timestamp("submitted_by_employee_at", {
      withTimezone: true,
    }),
    recordedByEmployerAt: timestamp("recorded_by_employer_at", {
      withTimezone: true,
    }),
    recordedByUserId: text("recorded_by_user_id"),
    effectiveFromMonth: date("effective_from_month").notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("employee_allowances_unique_effective").on(
      t.orgId,
      t.employeeId,
      t.taxYear,
      t.effectiveFromMonth
    ),
    index("employee_allowances_org_employee_idx").on(t.orgId, t.employeeId),
    check(
      "employee_allowances_counts_nonnegative_check",
      sql`${t.childCountPre2018} >= 0 AND ${t.childCountPost2018SecondPlus} >= 0`
    ),
  ]
);

export const payRuns = pgTable(
  "pay_runs",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    payDate: date("pay_date").notNull(),
    status: text("status").notNull().default("draft"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("pay_runs_org_period_idx").on(t.orgId, t.periodStart, t.periodEnd),
    check("pay_runs_status_check", sql`${t.status} IN ('draft', 'approved', 'paid', 'voided')`),
  ]
);

export const pndFilings = pgTable(
  "pnd_filings",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    formType: text("form_type").notNull(),
    taxPeriod: text("tax_period").notNull(),
    filingStatus: text("filing_status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    totalPayees: integer("total_payees"),
    totalGrossAmount: numeric("total_gross_amount", { precision: 14, scale: 2 }),
    totalWhtAmount: numeric("total_wht_amount", { precision: 14, scale: 2 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    bankTransactionId: uuid("bank_transaction_id").references(() => transactions.id),
    isAmendment: boolean("is_amendment").notNull().default(false),
    amendsFilingId: uuid("amends_filing_id"),
    amendmentReason: text("amendment_reason"),
    voluntaryAmendmentPenaltyPct: numeric("voluntary_amendment_penalty_pct", {
      precision: 5,
      scale: 4,
    }),
    surchargeAmount: numeric("surcharge_amount", { precision: 14, scale: 2 }),
    rdReferenceNumber: text("rd_reference_number"),
    confirmationDocumentId: uuid("confirmation_document_id").references(
      () => documents.id
    ),
    payload: jsonb("payload"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("pnd_filings_org_form_period_idx").on(t.orgId, t.formType, t.taxPeriod),
    check(
      "pnd_filings_form_type_check",
      sql`${t.formType} IN ('PND1', 'PND1KOR', 'PND2', 'PND3', 'PND53', 'PND54')`
    ),
    check(
      "pnd_filings_status_check",
      sql`${t.filingStatus} IN ('draft', 'submitted', 'accepted', 'rejected')`
    ),
  ]
);

export const ssoFilings = pgTable(
  "sso_filings",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    taxMonth: text("tax_month").notNull(),
    filingStatus: text("filing_status").notNull().default("draft"),
    totalEmployees: integer("total_employees"),
    totalEmployeeContribution: numeric("total_employee_contribution", {
      precision: 14,
      scale: 2,
    }),
    totalEmployerContribution: numeric("total_employer_contribution", {
      precision: 14,
      scale: 2,
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    bankTransactionId: uuid("bank_transaction_id").references(() => transactions.id),
    isAmendment: boolean("is_amendment").notNull().default(false),
    amendsFilingId: uuid("amends_filing_id"),
    amendmentReason: text("amendment_reason"),
    ssoReferenceNumber: text("sso_reference_number"),
    confirmationDocumentId: uuid("confirmation_document_id").references(
      () => documents.id
    ),
    payload: jsonb("payload"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("sso_filings_org_month_idx").on(t.orgId, t.taxMonth),
    check(
      "sso_filings_status_check",
      sql`${t.filingStatus} IN ('draft', 'submitted', 'accepted')`
    ),
  ]
);

export const taxMinLifeByCategory = pgTable(
  "tax_min_life_by_category",
  {
    category: text("category").primaryKey(),
    taxUsefulLifeMonthsMinimum: integer("tax_useful_life_months_minimum")
      .notNull(),
    sourceCitation: text("source_citation").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    check(
      "tax_min_life_months_nonnegative_check",
      sql`${t.taxUsefulLifeMonthsMinimum} >= 0`
    ),
  ]
);

export const fixedAssets = pgTable(
  "fixed_assets",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id").references(
      () => establishments.id
    ),
    assetCode: text("asset_code").notNull(),
    nameTh: text("name_th"),
    nameEn: text("name_en").notNull(),
    category: text("category").notNull(),
    glAccountId: uuid("gl_account_id").references(() => glAccounts.id),
    accumulatedDepreciationAccountId: uuid(
      "accumulated_depreciation_account_id"
    ).references(() => glAccounts.id),
    depreciationExpenseAccountId: uuid(
      "depreciation_expense_account_id"
    ).references(() => glAccounts.id),
    acquisitionDate: date("acquisition_date").notNull(),
    acquisitionDocumentId: uuid("acquisition_document_id").references(
      () => documents.id
    ),
    originalCost: numeric("original_cost", { precision: 14, scale: 2 })
      .notNull(),
    salvageValue: numeric("salvage_value", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    usefulLifeMonths: integer("useful_life_months").notNull(),
    taxUsefulLifeMonthsMinimum: integer("tax_useful_life_months_minimum")
      .notNull(),
    depreciationMethod: text("depreciation_method")
      .notNull()
      .default("straight_line"),
    depreciationStartDate: date("depreciation_start_date").notNull(),
    disposedAt: date("disposed_at"),
    disposalProceeds: numeric("disposal_proceeds", {
      precision: 14,
      scale: 2,
    }),
    disposalDocumentId: uuid("disposal_document_id").references(
      () => documents.id
    ),
    gainLossOnDisposal: numeric("gain_loss_on_disposal", {
      precision: 14,
      scale: 2,
    }),
    boiSegment: text("boi_segment").notNull().default("n_a"),
    serialNumber: text("serial_number"),
    location: text("location"),
    assignedToEmployeeId: uuid("assigned_to_employee_id").references(
      () => employees.id
    ),
    notes: text("notes"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("fixed_assets_id_org_uniq").on(t.id, t.orgId),
    unique("fixed_assets_org_code_uniq").on(t.orgId, t.assetCode),
    index("fixed_assets_org_category_idx").on(t.orgId, t.category),
    index("fixed_assets_org_acquisition_idx").on(t.orgId, t.acquisitionDate),
    check(
      "fixed_assets_category_check",
      sql`${t.category} IN ('building', 'temporary_building', 'equipment', 'vehicle', 'furniture_fixtures', 'computer_hardware', 'computer_software', 'leasehold_improvement', 'intangible_other', 'natural_resource_right', 'land')`
    ),
    check(
      "fixed_assets_amounts_nonnegative_check",
      sql`${t.originalCost} >= 0 AND ${t.salvageValue} >= 0`
    ),
    check(
      "fixed_assets_life_check",
      sql`(${t.depreciationMethod} = 'not_depreciable' AND ${t.usefulLifeMonths} = 0) OR (${t.depreciationMethod} = 'straight_line' AND ${t.usefulLifeMonths} > 0)`
    ),
    check(
      "fixed_assets_tax_life_nonnegative_check",
      sql`${t.taxUsefulLifeMonthsMinimum} >= 0`
    ),
    check(
      "fixed_assets_method_check",
      sql`${t.depreciationMethod} IN ('straight_line', 'not_depreciable')`
    ),
    check(
      "fixed_assets_disposal_check",
      sql`${t.disposedAt} IS NULL OR ${t.disposalProceeds} IS NOT NULL`
    ),
  ]
);

export const depreciationSchedule = pgTable(
  "depreciation_schedule",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    fixedAssetId: uuid("fixed_asset_id")
      .notNull()
      .references(() => fixedAssets.id),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    depreciationAmount: numeric("depreciation_amount", {
      precision: 14,
      scale: 2,
    }).notNull(),
    taxDepreciationCappedAmount: numeric("tax_depreciation_capped_amount", {
      precision: 14,
      scale: 2,
    }).notNull(),
    bookTaxDifference: numeric("book_tax_difference", {
      precision: 14,
      scale: 2,
    }).notNull(),
    accumulatedDepreciationAfter: numeric(
      "accumulated_depreciation_after",
      { precision: 14, scale: 2 }
    ).notNull(),
    bookValueAfter: numeric("book_value_after", {
      precision: 14,
      scale: 2,
    }).notNull(),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    isPartialMonth: boolean("is_partial_month").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("depreciation_schedule_asset_period_uniq").on(
      t.orgId,
      t.fixedAssetId,
      t.periodYear,
      t.periodMonth
    ),
    index("depreciation_schedule_org_period_idx").on(
      t.orgId,
      t.periodYear,
      t.periodMonth
    ),
    check(
      "depreciation_schedule_period_month_check",
      sql`${t.periodMonth} BETWEEN 1 AND 12`
    ),
    check(
      "depreciation_schedule_amounts_nonnegative_check",
      sql`${t.depreciationAmount} >= 0 AND ${t.taxDepreciationCappedAmount} >= 0 AND ${t.accumulatedDepreciationAfter} >= 0 AND ${t.bookValueAfter} >= 0`
    ),
  ]
);

export const fixedAssetDepreciationPeriods = pgTable(
  "fixed_asset_depreciation_periods",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    scheduleRowsCreated: integer("schedule_rows_created").notNull().default(0),
    postingOutboxId: uuid("posting_outbox_id").references(() => postingOutbox.id),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
    createdByUserId: text("created_by_user_id"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("fixed_asset_depreciation_periods_org_period_idx").on(
      t.orgId,
      t.periodYear,
      t.periodMonth
    ),
    check(
      "fixed_asset_depreciation_periods_month_check",
      sql`${t.periodMonth} BETWEEN 1 AND 12`
    ),
    check(
      "fixed_asset_depreciation_periods_schedule_rows_nonnegative_check",
      sql`${t.scheduleRowsCreated} >= 0`
    ),
  ]
);

export const closeChecklists = pgTable(
  "close_checklists",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id").references(
      () => establishments.id
    ),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    status: text("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("close_checklists_org_period_uniq").on(
      t.orgId,
      t.establishmentId,
      t.periodYear,
      t.periodMonth
    ),
    index("close_checklists_org_status_idx").on(t.orgId, t.status),
    check(
      "close_checklists_period_month_check",
      sql`${t.periodMonth} BETWEEN 1 AND 12`
    ),
    check(
      "close_checklists_status_check",
      sql`${t.status} IN ('open', 'in_progress', 'closed')`
    ),
  ]
);

export const closeChecklistItems = pgTable(
  "close_checklist_items",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => closeChecklists.id),
    sequence: integer("sequence").notNull(),
    itemKey: text("item_key").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("pending"),
    assignedToUserId: text("assigned_to_user_id"),
    completedByUserId: text("completed_by_user_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("close_checklist_items_sequence_uniq").on(t.checklistId, t.sequence),
    unique("close_checklist_items_key_uniq").on(t.checklistId, t.itemKey),
    index("close_checklist_items_org_status_idx").on(t.orgId, t.status),
    check("close_checklist_items_sequence_positive_check", sql`${t.sequence} > 0`),
    check(
      "close_checklist_items_status_check",
      sql`${t.status} IN ('pending', 'done', 'skipped', 'blocked')`
    ),
    check(
      "close_checklist_items_completed_check",
      sql`${t.status} <> 'done' OR ${t.completedAt} IS NOT NULL`
    ),
  ]
);

export const costCenters = pgTable(
  "cost_centers",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    nameTh: text("name_th"),
    nameEn: text("name_en").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => costCenters.id),
    isActive: boolean("is_active").notNull().default(true),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("cost_centers_id_org_uniq").on(t.id, t.orgId),
    unique("cost_centers_org_code_uniq").on(t.orgId, t.code),
  ]
);

export const projects = pgTable(
  "projects",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    nameTh: text("name_th"),
    nameEn: text("name_en").notNull(),
    customerVendorId: uuid("customer_vendor_id").references(() => vendors.id),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: text("status").notNull().default("active"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("projects_id_org_uniq").on(t.id, t.orgId),
    unique("projects_org_code_uniq").on(t.orgId, t.code),
    index("projects_org_status_idx").on(t.orgId, t.status),
    check(
      "projects_status_check",
      sql`${t.status} IN ('planned', 'active', 'paused', 'completed', 'cancelled')`
    ),
  ]
);

export const allocationRules = pgTable(
  "allocation_rules",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    ruleName: text("rule_name").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id"),
    sourceKey: text("source_key"),
    isActive: boolean("is_active").notNull().default(true),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("allocation_rules_id_org_uniq").on(t.id, t.orgId),
    index("allocation_rules_org_active_idx").on(t.orgId, t.isActive),
    index("allocation_rules_org_source_key_idx")
      .on(t.orgId, t.sourceType, t.sourceKey)
      .where(sql`${t.deletedAt} IS NULL`),
    check(
      "allocation_rules_source_type_check",
      sql`${t.sourceType} IN ('gl_account', 'vendor', 'category')`
    ),
    check(
      "allocation_rules_effective_range_check",
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveFrom} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`
    ),
  ]
);

export const allocationRuleTargets = pgTable(
  "allocation_rule_targets",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    allocationRuleId: uuid("allocation_rule_id")
      .notNull()
      .references(() => allocationRules.id),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id),
    projectId: uuid("project_id").references(() => projects.id),
    percentage: numeric("percentage", { precision: 5, scale: 4 }).notNull(),
    notes: text("notes"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("allocation_rule_targets_rule_idx").on(t.allocationRuleId),
    check(
      "allocation_rule_targets_percentage_check",
      sql`${t.percentage} > 0 AND ${t.percentage} <= 1`
    ),
    check(
      "allocation_rule_targets_has_dimension_check",
      sql`${t.costCenterId} IS NOT NULL OR ${t.projectId} IS NOT NULL`
    ),
  ]
);

export const fxRatesBot = pgTable(
  "fx_rates_bot",
  {
    id,
    rateDate: date("rate_date").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    buyingRate: numeric("buying_rate", { precision: 18, scale: 8 }),
    sellingRate: numeric("selling_rate", { precision: 18, scale: 8 }),
    midRate: numeric("mid_rate", { precision: 18, scale: 8 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("fx_rates_bot_date_currency_uniq").on(t.rateDate, t.currency),
    check("fx_rates_bot_mid_positive_check", sql`${t.midRate} > 0`),
  ]
);

export const fxValuationLayers = pgTable(
  "fx_valuation_layers",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    monetaryItemType: text("monetary_item_type").notNull(),
    monetaryItemId: uuid("monetary_item_id").notNull(),
    originalAmount: numeric("original_amount", { precision: 14, scale: 2 })
      .notNull(),
    originalCurrency: varchar("original_currency", { length: 3 }).notNull(),
    valuationDate: date("valuation_date").notNull(),
    valuationRate: numeric("valuation_rate", { precision: 18, scale: 8 })
      .notNull(),
    valuedThbAmount: numeric("valued_thb_amount", {
      precision: 14,
      scale: 2,
    }).notNull(),
    priorValuationId: uuid("prior_valuation_id").references(
      (): AnyPgColumn => fxValuationLayers.id
    ),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
    realized: boolean("realized").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("fx_valuation_layers_item_date_uniq").on(
      t.orgId,
      t.monetaryItemType,
      t.monetaryItemId,
      t.valuationDate
    ),
    index("fx_valuation_layers_org_date_idx").on(t.orgId, t.valuationDate),
    check(
      "fx_valuation_layers_type_check",
      sql`${t.monetaryItemType} IN ('bank_account', 'ar_invoice', 'ap_invoice', 'loan', 'wht_credit_received')`
    ),
    check(
      "fx_valuation_layers_positive_check",
      sql`${t.valuationRate} > 0 AND ${t.valuedThbAmount} >= 0`
    ),
  ]
);

export const citBrackets = pgTable(
  "cit_brackets",
  {
    id,
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    entityType: text("entity_type").notNull(),
    lowerBound: numeric("lower_bound", { precision: 14, scale: 2 }).notNull(),
    upperBound: numeric("upper_bound", { precision: 14, scale: 2 }),
    marginalRate: numeric("marginal_rate", { precision: 5, scale: 4 }).notNull(),
    sourceCitation: text("source_citation").notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("cit_brackets_lookup_idx").on(t.entityType, t.effectiveFrom),
    check(
      "cit_brackets_entity_type_check",
      sql`${t.entityType} IN ('sme_qualifying', 'standard')`
    ),
    check(
      "cit_brackets_bounds_check",
      sql`${t.lowerBound} >= 0 AND (${t.upperBound} IS NULL OR ${t.upperBound} > ${t.lowerBound})`
    ),
    check(
      "cit_brackets_rate_check",
      sql`${t.marginalRate} >= 0 AND ${t.marginalRate} <= 1`
    ),
  ]
);

export const citFilings = pgTable(
  "cit_filings",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    taxYear: integer("tax_year").notNull(),
    filingType: text("filing_type").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    filingStatus: text("filing_status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revenueTotal: numeric("revenue_total", { precision: 14, scale: 2 }),
    cogsTotal: numeric("cogs_total", { precision: 14, scale: 2 }),
    expenseTotal: numeric("expense_total", { precision: 14, scale: 2 }),
    accountingProfit: numeric("accounting_profit", { precision: 14, scale: 2 }),
    bookTaxAdjustmentsPayload: jsonb("book_tax_adjustments_payload"),
    taxableIncome: numeric("taxable_income", { precision: 14, scale: 2 }),
    taxableLoss: numeric("taxable_loss", { precision: 14, scale: 2 }),
    lossesConsumedThisYear: numeric("losses_consumed_this_year", {
      precision: 14,
      scale: 2,
    }),
    lossCarryForwardConsumptionPayload: jsonb(
      "loss_carry_forward_consumption_payload"
    ),
    citRate: numeric("cit_rate", { precision: 5, scale: 4 }),
    citCalculated: numeric("cit_calculated", { precision: 14, scale: 2 }),
    whtCreditsUsed: numeric("wht_credits_used", { precision: 14, scale: 2 }),
    prepaymentCreditsUsed: numeric("prepayment_credits_used", {
      precision: 14,
      scale: 2,
    }),
    pnd51Method: text("pnd51_method"),
    pnd51ProjectedFullYearProfit: numeric(
      "pnd51_projected_full_year_profit",
      { precision: 14, scale: 2 }
    ),
    pnd51H1ActualProfit: numeric("pnd51_h1_actual_profit", {
      precision: 14,
      scale: 2,
    }),
    pnd51EstimateRationale: text("pnd51_estimate_rationale"),
    citPayable: numeric("cit_payable", { precision: 14, scale: 2 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    bankTransactionId: uuid("bank_transaction_id").references(() => transactions.id),
    isAmendment: boolean("is_amendment").notNull().default(false),
    amendsFilingId: uuid("amends_filing_id"),
    rdReferenceNumber: text("rd_reference_number"),
    confirmationDocumentId: uuid("confirmation_document_id").references(
      () => documents.id
    ),
    workingPaperDocumentId: uuid("working_paper_document_id").references(
      () => documents.id
    ),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("cit_filings_non_amendment_uniq")
      .on(t.orgId, t.taxYear, t.filingType)
      .where(sql`${t.isAmendment} = false AND ${t.amendsFilingId} IS NULL`),
    uniqueIndex("cit_filings_amendment_uniq")
      .on(t.orgId, t.taxYear, t.filingType, t.amendsFilingId)
      .where(sql`${t.isAmendment} = true AND ${t.amendsFilingId} IS NOT NULL`),
    index("cit_filings_org_year_idx").on(t.orgId, t.taxYear),
    check("cit_filings_type_check", sql`${t.filingType} IN ('pnd51', 'pnd50')`),
    check(
      "cit_filings_status_check",
      sql`${t.filingStatus} IN ('draft', 'submitted', 'accepted')`
    ),
    check(
      "cit_filings_pnd51_method_check",
      sql`${t.pnd51Method} IS NULL OR ${t.pnd51Method} IN ('projected_full_year', 'actual_h1_books')`
    ),
  ]
);

export const bookTaxAdjustments = pgTable(
  "book_tax_adjustments",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    taxYear: integer("tax_year").notNull(),
    description: text("description").notNull(),
    glAccountId: uuid("gl_account_id").references(() => glAccounts.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    direction: text("direction").notNull(),
    category: text("category").notNull(),
    notes: text("notes"),
    auditLogRef: uuid("audit_log_ref"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("book_tax_adjustments_org_year_idx").on(t.orgId, t.taxYear),
    check(
      "book_tax_adjustments_direction_check",
      sql`${t.direction} IN ('add_back', 'deduct')`
    ),
    check("book_tax_adjustments_amount_check", sql`${t.amount} >= 0`),
  ]
);

export const lossCarryForwardLayers = pgTable(
  "loss_carry_forward_layers",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    originatedTaxYear: integer("originated_tax_year").notNull(),
    expiryTaxYear: integer("expiry_tax_year").notNull(),
    originalAmount: numeric("original_amount", { precision: 14, scale: 2 })
      .notNull(),
    remainingAmount: numeric("remaining_amount", { precision: 14, scale: 2 })
      .notNull(),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("loss_carry_forward_layers_org_year_uniq").on(
      t.orgId,
      t.originatedTaxYear
    ),
    index("loss_carry_forward_layers_org_expiry_idx").on(
      t.orgId,
      t.expiryTaxYear
    ),
    check(
      "loss_carry_forward_layers_year_check",
      sql`${t.expiryTaxYear} = ${t.originatedTaxYear} + 5`
    ),
    check(
      "loss_carry_forward_layers_amount_check",
      sql`${t.originalAmount} >= 0 AND ${t.remainingAmount} >= 0 AND ${t.remainingAmount} <= ${t.originalAmount}`
    ),
  ]
);

export const transferPricingDisclosures = pgTable(
  "transfer_pricing_disclosures",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    taxYear: integer("tax_year").notNull(),
    status: text("status").notNull().default("draft"),
    revenueTotal: numeric("revenue_total", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    disclosureRequired: boolean("disclosure_required").notNull().default(false),
    relatedPartyTransactionsPayload: jsonb("related_party_transactions_payload"),
    notes: text("notes"),
    preparedByUserId: text("prepared_by_user_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("transfer_pricing_disclosures_org_year_uniq").on(t.orgId, t.taxYear),
    index("transfer_pricing_disclosures_org_status_idx").on(t.orgId, t.status),
    check(
      "transfer_pricing_disclosures_status_check",
      sql`${t.status} IN ('draft', 'submitted')`
    ),
  ]
);

export const copilotSessions = pgTable(
  "copilot_sessions",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").notNull(),
    title: text("title").notNull().default("Copilot session"),
    status: text("status").notNull().default("open"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    index("copilot_sessions_org_user_idx").on(t.orgId, t.userId),
    check(
      "copilot_sessions_status_check",
      sql`${t.status} IN ('open', 'archived')`
    ),
  ]
);

export const copilotMessages = pgTable(
  "copilot_messages",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => copilotSessions.id),
    role: text("role").notNull(),
    content: text("content").notNull(),
    toolName: text("tool_name"),
    payload: jsonb("payload"),
    createdAt,
  },
  (t) => [
    index("copilot_messages_org_session_idx").on(t.orgId, t.sessionId),
    check("copilot_messages_role_check", sql`${t.role} IN ('user', 'assistant', 'tool')`),
  ]
);

export const copilotToolEvents = pgTable(
  "copilot_tool_events",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    sessionId: uuid("session_id").references(() => copilotSessions.id),
    toolName: text("tool_name").notNull(),
    risk: text("risk").notNull(),
    previewRequired: boolean("preview_required").notNull(),
    status: text("status").notNull().default("succeeded"),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    error: text("error"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt,
  },
  (t) => [
    index("copilot_tool_events_org_created_idx").on(t.orgId, t.createdAt),
    index("copilot_tool_events_org_tool_idx").on(t.orgId, t.toolName),
    check(
      "copilot_tool_events_risk_check",
      sql`${t.risk} IN ('read', 'draft', 'write', 'bulk_write', 'filing_impact')`
    ),
    check(
      "copilot_tool_events_status_check",
      sql`${t.status} IN ('succeeded', 'failed', 'blocked')`
    ),
  ]
);

export const paySlips = pgTable(
  "pay_slips",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id),
    payRunId: uuid("pay_run_id")
      .notNull()
      .references(() => payRuns.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    pnd1IncomeType: text("pnd1_income_type").notNull().default("40_1"),
    grossSalary: numeric("gross_salary", { precision: 14, scale: 2 }).notNull(),
    bonus: numeric("bonus", { precision: 14, scale: 2 }).notNull().default("0"),
    bonusTreatment: text("bonus_treatment").notNull().default("rolled_in"),
    overtime: numeric("overtime", { precision: 14, scale: 2 }).notNull().default("0"),
    otherTaxableIncome: numeric("other_taxable_income", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    nonTaxableAllowances: numeric("non_taxable_allowances", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    pitWht: numeric("pit_wht", { precision: 14, scale: 2 }).notNull(),
    ssoEmployee: numeric("sso_employee", { precision: 14, scale: 2 }).notNull(),
    ssoEmployer: numeric("sso_employer", { precision: 14, scale: 2 }).notNull(),
    providentFundEmployee: numeric("provident_fund_employee", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    providentFundEmployer: numeric("provident_fund_employer", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    otherDeductions: numeric("other_deductions", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    severancePayment: numeric("severance_payment", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    accruedLeavePayout: numeric("accrued_leave_payout", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0"),
    inlieuOfNotice: numeric("inlieu_of_notice", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    specialTreatmentOverride: boolean("special_treatment_override")
      .notNull()
      .default(false),
    specialTreatmentNote: text("special_treatment_note"),
    netPay: numeric("net_pay", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: text("payment_method"),
    bankTransactionId: uuid("bank_transaction_id").references(() => transactions.id),
    whtCertificateId: uuid("wht_certificate_id").references(() => whtCertificates.id),
    pndFilingId: uuid("pnd_filing_id").references(() => pndFilings.id),
    payload: jsonb("payload"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("pay_slips_org_employee_idx").on(t.orgId, t.employeeId),
    index("pay_slips_org_run_idx").on(t.orgId, t.payRunId),
    check("pay_slips_income_type_check", sql`${t.pnd1IncomeType} IN ('40_1', '40_2')`),
    check(
      "pay_slips_bonus_treatment_check",
      sql`${t.bonusTreatment} IN ('rolled_in', 'separate_event')`
    ),
    check(
      "pay_slips_amounts_nonnegative_check",
      sql`${t.grossSalary} >= 0 AND ${t.bonus} >= 0 AND ${t.overtime} >= 0 AND ${t.pitWht} >= 0 AND ${t.ssoEmployee} >= 0 AND ${t.ssoEmployer} >= 0 AND ${t.netPay} >= 0`
    ),
    check(
      "pay_slips_override_note_check",
      sql`${t.specialTreatmentOverride} = false OR ${t.specialTreatmentNote} IS NOT NULL`
    ),
  ]
);

export const pitBrackets = pgTable("pit_brackets", {
  id,
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  lowerBound: numeric("lower_bound", { precision: 14, scale: 2 }).notNull(),
  upperBound: numeric("upper_bound", { precision: 14, scale: 2 }),
  marginalRate: numeric("marginal_rate", { precision: 5, scale: 4 }).notNull(),
  cumulativeTaxAtLowerBound: numeric("cumulative_tax_at_lower_bound", {
    precision: 14,
    scale: 2,
  }).notNull(),
  sourceCitation: text("source_citation").notNull(),
  createdAt,
  updatedAt,
});

export const pitStandardDeductions = pgTable("pit_standard_deductions", {
  id,
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  employmentExpensePct: numeric("employment_expense_pct", {
    precision: 5,
    scale: 4,
  }).notNull(),
  employmentExpenseCap: numeric("employment_expense_cap", {
    precision: 14,
    scale: 2,
  }).notNull(),
  personalAllowance: numeric("personal_allowance", {
    precision: 14,
    scale: 2,
  }).notNull(),
  spouseAllowance: numeric("spouse_allowance", { precision: 14, scale: 2 }).notNull(),
  childPre2018Allowance: numeric("child_pre_2018_allowance", {
    precision: 14,
    scale: 2,
  }).notNull(),
  childPost2018SecondPlusAllowance: numeric(
    "child_post_2018_second_plus_allowance",
    { precision: 14, scale: 2 }
  ).notNull(),
  parentAllowancePer: numeric("parent_allowance_per", {
    precision: 14,
    scale: 2,
  }).notNull(),
  sourceCitation: text("source_citation").notNull(),
  createdAt,
  updatedAt,
});

export const ssoConfig = pgTable("sso_config", {
  id,
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  employeeRate: numeric("employee_rate", { precision: 5, scale: 4 }).notNull(),
  employerRate: numeric("employer_rate", { precision: 5, scale: 4 }).notNull(),
  insurableWageFloor: numeric("insurable_wage_floor", {
    precision: 14,
    scale: 2,
  }).notNull(),
  insurableWageCap: numeric("insurable_wage_cap", {
    precision: 14,
    scale: 2,
  }).notNull(),
  monthlyMaxPerSide: numeric("monthly_max_per_side", {
    precision: 14,
    scale: 2,
  }).notNull(),
  sourceCitation: text("source_citation").notNull(),
  createdAt,
  updatedAt,
});

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

export const thaiBusinessCalendar = pgTable(
  "thai_business_calendar",
  {
    date: date("date").primaryKey(),
    holidayNameTh: text("holiday_name_th").notNull(),
    holidayNameEn: text("holiday_name_en").notNull(),
    sourceAnnouncement: text("source_announcement").notNull(),
    createdAt,
  },
  (t) => [index("thai_business_calendar_date").on(t.date)]
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
    copilotProvider: text("copilot_provider"),
    copilotModel: text("copilot_model"),
    copilotApiKeySecretRef: text("copilot_api_key_secret_ref"),
    copilotApiKeyLast4: text("copilot_api_key_last4"),
    copilotMonthlyBudgetUsd: numeric("copilot_monthly_budget_usd", { precision: 8, scale: 2 }),
    copilotLiveModelEnabled: boolean("copilot_live_model_enabled").notNull().default(false),
    copilotWriteToolsEnabled: boolean("copilot_write_tools_enabled").notNull().default(false),
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

export const recurringPaymentPatterns = pgTable(
  "recurring_payment_patterns",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    expectedAmount: numeric("expected_amount", { precision: 14, scale: 2 }),
    amountTolerance: numeric("amount_tolerance", { precision: 5, scale: 4 }).default("0.0500"),
    expectedDayOfMonth: integer("expected_day_of_month"),
    dayTolerance: integer("day_tolerance").default(5),
    counterpartyPattern: text("counterparty_pattern"),
    occurrenceCount: integer("occurrence_count").notNull().default(0),
    lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true }),
    isConfirmed: boolean("is_confirmed").notNull().default(false),
    createdAt,
    updatedAt,
    deletedAt,
  }
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

// ---------------------------------------------------------------------------
// Extraction Learning Loop Tables (Phase 8)
// ---------------------------------------------------------------------------

export const fieldCriticalityEnum = pgEnum("field_criticality", [
  "low",
  "medium",
  "high",
]);

export const vendorTierScopeKindEnum = pgEnum("vendor_tier_scope_kind", [
  "org",
  "global",
]);

export const consensusStatusEnum = pgEnum("consensus_status", [
  "candidate",
  "shadow_pending",
  "promoted",
  "retired",
]);

export const compiledPatternStatusEnum = pgEnum("compiled_pattern_status", [
  "shadow",
  "active",
  "retired",
]);

export const extractionCorrectionSessionStatusEnum = pgEnum(
  "extraction_correction_session_status",
  ["draft", "confirmed", "abandoned"]
);

export const extractionLearningCandidateTypeEnum = pgEnum(
  "extraction_learning_candidate_type",
  ["field_exemplar", "field_rule", "document_family_rule", "vendor_rule"]
);

export const extractionLearningCandidateScopeEnum = pgEnum(
  "extraction_learning_candidate_scope",
  ["document", "vendor", "vendor_document_family", "global_candidate"]
);

export const extractionLearningCandidateStatusEnum = pgEnum(
  "extraction_learning_candidate_status",
  ["candidate", "shadow", "active", "retired", "rejected"]
);

// NOTE: The migration for this table includes a hand-edited CHECK constraint:
//   (was_corrected = true AND ai_value IS DISTINCT FROM user_value)
//   OR (was_corrected = false AND ai_value IS NOT DISTINCT FROM user_value)
// Do not regenerate the migration without preserving this CHECK.
export const extractionExemplars = pgTable(
  "extraction_exemplars",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    fieldName: text("field_name").notNull(),
    fieldCriticality: fieldCriticalityEnum("field_criticality").notNull(),
    aiValue: text("ai_value"),
    userValue: text("user_value"),
    wasCorrected: boolean("was_corrected").notNull(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    correctionSessionId: uuid("correction_session_id").references(
      () => extractionCorrectionSessions.id
    ),
    sourceRegion: jsonb("source_region"),
    modelUsed: text("model_used"),
    confidenceAtTime: numeric("confidence_at_time", { precision: 5, scale: 4 }),
    vendorTaxId: varchar("vendor_tax_id", { length: 13 }),
    createdAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("idx_exemplars_unique_active")
      .on(t.orgId, t.vendorId, t.fieldName, t.documentId)
      .where(sql`${t.deletedAt} IS NULL`),
    index("idx_exemplars_top_recent")
      .on(t.orgId, t.vendorId, t.fieldName, t.createdAt)
      .where(sql`${t.deletedAt} IS NULL`),
    index("idx_exemplars_by_vendor_tax_id")
      .on(t.vendorTaxId, t.fieldName)
      .where(sql`${t.wasCorrected} = true AND ${t.deletedAt} IS NULL AND ${t.vendorTaxId} IS NOT NULL`),
  ]
);

export const vendorTier = pgTable(
  "vendor_tier",
  {
    id,
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    scopeKind: vendorTierScopeKindEnum("scope_kind").notNull(),
    orgId: uuid("org_id").references(() => organizations.id),
    tier: smallint("tier").notNull().default(0),
    docsProcessedTotal: integer("docs_processed_total").notNull().default(0),
    lastDocAt: timestamp("last_doc_at", { withTimezone: true }),
    lastPromotedAt: timestamp("last_promoted_at", { withTimezone: true }),
    lastDemotedAt: timestamp("last_demoted_at", { withTimezone: true }),
    updatedAt,
  },
  (t) => [
    uniqueIndex("idx_vendor_tier_unique_org")
      .on(t.vendorId, t.orgId)
      .where(sql`${t.scopeKind} = 'org'`),
    uniqueIndex("idx_vendor_tier_unique_global")
      .on(t.vendorId)
      .where(sql`${t.scopeKind} = 'global'`),
  ]
);

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
    tierUsed: smallint("tier_used").notNull(),
    exemplarIds: uuid("exemplar_ids").array(),
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

export const extractionCorrectionSessions = pgTable(
  "extraction_correction_sessions",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    extractionLogId: uuid("extraction_log_id")
      .notNull()
      .references(() => extractionLog.id),
    startedByUserId: text("started_by_user_id").notNull(),
    confirmedByUserId: text("confirmed_by_user_id"),
    status: extractionCorrectionSessionStatusEnum("status")
      .notNull()
      .default("draft"),
    userExplanation: text("user_explanation"),
    aiInterpretation: jsonb("ai_interpretation"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("idx_correction_sessions_active_log")
      .on(t.extractionLogId)
      .where(sql`${t.deletedAt} IS NULL`),
    index("idx_correction_sessions_org_document")
      .on(t.orgId, t.documentId, t.createdAt)
      .where(sql`${t.deletedAt} IS NULL`),
    index("idx_correction_sessions_org_status")
      .on(t.orgId, t.status, t.createdAt)
      .where(sql`${t.deletedAt} IS NULL`),
  ]
);

export const extractionReviewOutcome = pgTable(
  "extraction_review_outcome",
  {
    id,
    extractionLogId: uuid("extraction_log_id")
      .notNull()
      .references(() => extractionLog.id)
      .unique(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    correctionSessionId: uuid("correction_session_id").references(
      () => extractionCorrectionSessions.id
    ),
    userCorrected: boolean("user_corrected").notNull(),
    correctionCount: integer("correction_count").notNull().default(0),
    reviewedByUserId: text("reviewed_by_user_id").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);

export const extractionLearningCandidates = pgTable(
  "extraction_learning_candidates",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    correctionSessionId: uuid("correction_session_id")
      .notNull()
      .references(() => extractionCorrectionSessions.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    vendorKey: text("vendor_key"),
    documentFamily: text("document_family"),
    fieldName: text("field_name").notNull(),
    fieldCriticality: fieldCriticalityEnum("field_criticality").notNull(),
    candidateType: extractionLearningCandidateTypeEnum("candidate_type").notNull(),
    aiValue: text("ai_value"),
    confirmedValue: text("confirmed_value"),
    rationale: text("rationale"),
    selectorHint: text("selector_hint"),
    rejectHint: text("reject_hint"),
    appliesWhen: jsonb("applies_when").notNull().default(sql`'[]'::jsonb`),
    scope: extractionLearningCandidateScopeEnum("scope").notNull(),
    status: extractionLearningCandidateStatusEnum("status")
      .notNull()
      .default("candidate"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    promotionEvidence: jsonb("promotion_evidence"),
    retirementReason: text("retirement_reason"),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [
    uniqueIndex("idx_learning_candidates_unique_active")
      .on(t.correctionSessionId, t.fieldName, t.candidateType)
      .where(sql`${t.deletedAt} IS NULL`),
    index("idx_learning_candidates_org_vendor_field")
      .on(t.orgId, t.vendorId, t.documentFamily, t.fieldName, t.status)
      .where(sql`${t.deletedAt} IS NULL`),
    index("idx_learning_candidates_session")
      .on(t.correctionSessionId)
      .where(sql`${t.deletedAt} IS NULL`),
  ]
);

// ---------------------------------------------------------------------------
// Global Consensus Tables (Phase 8 Phase 2)
// ---------------------------------------------------------------------------

export const orgReputation = pgTable("org_reputation", {
  id,
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id)
    .unique(),
  score: numeric("score", { precision: 5, scale: 4 }).notNull().default("1.0"),
  correctionsTotal: integer("corrections_total").notNull().default(0),
  correctionsAgreed: integer("corrections_agreed").notNull().default(0),
  correctionsDisputed: integer("corrections_disputed").notNull().default(0),
  firstDocAt: timestamp("first_doc_at", { withTimezone: true }),
  docsProcessed: integer("docs_processed").notNull().default(0),
  eligible: boolean("eligible").notNull().default(false),
  updatedAt,
});

export const exemplarConsensus = pgTable(
  "exemplar_consensus",
  {
    id,
    vendorKey: varchar("vendor_key", { length: 13 }).notNull(),
    fieldName: text("field_name").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    normalizedValueHash: text("normalized_value_hash").notNull(),
    fieldCriticality: fieldCriticalityEnum("field_criticality").notNull(),
    weightedOrgCount: numeric("weighted_org_count", { precision: 8, scale: 4 })
      .notNull()
      .default("0"),
    agreeingOrgCount: integer("agreeing_org_count").notNull().default(0),
    contradictingCount: integer("contradicting_count").notNull().default(0),
    status: consensusStatusEnum("status").notNull().default("candidate"),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    recomputedAt: timestamp("recomputed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt,
  },
  (t) => [
    uniqueIndex("idx_consensus_unique_value").on(
      t.vendorKey,
      t.fieldName,
      t.normalizedValueHash
    ),
    index("idx_consensus_promotion_lookup").on(
      t.status,
      t.vendorKey,
      t.fieldName
    ),
  ]
);

export const globalExemplarPool = pgTable(
  "global_exemplar_pool",
  {
    id,
    vendorKey: varchar("vendor_key", { length: 13 }).notNull(),
    fieldName: text("field_name").notNull(),
    canonicalValue: text("canonical_value").notNull(),
    fieldCriticality: fieldCriticalityEnum("field_criticality").notNull(),
    consensusId: uuid("consensus_id")
      .notNull()
      .references(() => exemplarConsensus.id),
    promotedAt: timestamp("promoted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("idx_global_pool_active_field")
      .on(t.vendorKey, t.fieldName)
      .where(sql`${t.retiredAt} IS NULL`),
    index("idx_global_pool_vendor_active")
      .on(t.vendorKey)
      .where(sql`${t.retiredAt} IS NULL`),
  ]
);

// ---------------------------------------------------------------------------
// Compiled Patterns (Phase 8 Phase 3 — Tier 3)
// ---------------------------------------------------------------------------

export const extractionCompiledPatterns = pgTable(
  "extraction_compiled_patterns",
  {
    id,
    vendorKey: text("vendor_key").notNull(),
    scopeKind: vendorTierScopeKindEnum("scope_kind").notNull(),
    orgId: uuid("org_id").references(() => organizations.id),
    version: integer("version").notNull(),
    sourceTs: text("source_ts").notNull(),
    compiledJs: text("compiled_js").notNull(),
    tsCompilerVersion: text("ts_compiler_version").notNull(),
    astHash: text("ast_hash").notNull(),
    trainingSetHash: text("training_set_hash").notNull(),
    shadowAccuracy: numeric("shadow_accuracy", { precision: 5, scale: 4 }),
    shadowSampleSize: integer("shadow_sample_size"),
    status: compiledPatternStatusEnum("status").notNull().default("shadow"),
    requiresManualReview: boolean("requires_manual_review")
      .notNull()
      .default(true),
    createdAt,
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    retirementReason: text("retirement_reason"),
  },
  (t) => [
    // Only one active pattern per vendor+scope+org
    uniqueIndex("idx_compiled_pattern_active")
      .on(t.vendorKey, t.scopeKind, sql`COALESCE(${t.orgId}::text, 'global')`)
      .where(sql`${t.status} = 'active'`),
    // Versioned patterns per vendor+scope+org
    uniqueIndex("idx_compiled_pattern_version").on(
      t.vendorKey,
      t.scopeKind,
      sql`COALESCE(${t.orgId}::text, 'global')`,
      t.version
    ),
    // CHECK: (scope_kind = 'org' AND org_id IS NOT NULL) OR (scope_kind = 'global' AND org_id IS NULL)
    // NOTE: This CHECK constraint must be added manually in the migration SQL
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
  glAccounts: many(glAccounts),
  journalEntries: many(journalEntries),
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

export const glAccountsRelations = relations(glAccounts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [glAccounts.orgId],
    references: [organizations.id],
  }),
  parent: one(glAccounts, {
    fields: [glAccounts.parentAccountId],
    references: [glAccounts.id],
    relationName: "gl_account_parent",
  }),
  children: many(glAccounts, { relationName: "gl_account_parent" }),
  journalLines: many(journalLines),
}));

export const journalEntriesRelations = relations(
  journalEntries,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [journalEntries.orgId],
      references: [organizations.id],
    }),
    lines: many(journalLines),
    reversesEntry: one(journalEntries, {
      fields: [journalEntries.reversesEntryId],
      references: [journalEntries.id],
      relationName: "journal_entry_reversal",
    }),
    reversedByEntry: one(journalEntries, {
      fields: [journalEntries.reversedByEntryId],
      references: [journalEntries.id],
      relationName: "journal_entry_reverse_pointer",
    }),
  })
);

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  organization: one(organizations, {
    fields: [journalLines.orgId],
    references: [organizations.id],
  }),
  journalEntry: one(journalEntries, {
    fields: [journalLines.journalEntryId],
    references: [journalEntries.id],
  }),
  account: one(glAccounts, {
    fields: [journalLines.accountId],
    references: [glAccounts.id],
  }),
}));

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

export const recurringPaymentPatternsRelations = relations(
  recurringPaymentPatterns,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [recurringPaymentPatterns.orgId],
      references: [organizations.id],
    }),
    vendor: one(vendors, {
      fields: [recurringPaymentPatterns.vendorId],
      references: [vendors.id],
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

export const extractionExemplarsRelations = relations(
  extractionExemplars,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [extractionExemplars.orgId],
      references: [organizations.id],
    }),
    vendor: one(vendors, {
      fields: [extractionExemplars.vendorId],
      references: [vendors.id],
    }),
    document: one(documents, {
      fields: [extractionExemplars.documentId],
      references: [documents.id],
    }),
    correctionSession: one(extractionCorrectionSessions, {
      fields: [extractionExemplars.correctionSessionId],
      references: [extractionCorrectionSessions.id],
    }),
  })
);

export const vendorTierRelations = relations(vendorTier, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorTier.vendorId],
    references: [vendors.id],
  }),
  organization: one(organizations, {
    fields: [vendorTier.orgId],
    references: [organizations.id],
  }),
}));

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
    reviewOutcome: one(extractionReviewOutcome),
    correctionSession: one(extractionCorrectionSessions),
  })
);

export const extractionCorrectionSessionsRelations = relations(
  extractionCorrectionSessions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [extractionCorrectionSessions.orgId],
      references: [organizations.id],
    }),
    document: one(documents, {
      fields: [extractionCorrectionSessions.documentId],
      references: [documents.id],
    }),
    extractionLog: one(extractionLog, {
      fields: [extractionCorrectionSessions.extractionLogId],
      references: [extractionLog.id],
    }),
    candidates: many(extractionLearningCandidates),
  })
);

export const extractionReviewOutcomeRelations = relations(
  extractionReviewOutcome,
  ({ one }) => ({
    extractionLog: one(extractionLog, {
      fields: [extractionReviewOutcome.extractionLogId],
      references: [extractionLog.id],
    }),
    document: one(documents, {
      fields: [extractionReviewOutcome.documentId],
      references: [documents.id],
    }),
    organization: one(organizations, {
      fields: [extractionReviewOutcome.orgId],
      references: [organizations.id],
    }),
    correctionSession: one(extractionCorrectionSessions, {
      fields: [extractionReviewOutcome.correctionSessionId],
      references: [extractionCorrectionSessions.id],
    }),
  })
);

export const extractionLearningCandidatesRelations = relations(
  extractionLearningCandidates,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [extractionLearningCandidates.orgId],
      references: [organizations.id],
    }),
    document: one(documents, {
      fields: [extractionLearningCandidates.documentId],
      references: [documents.id],
    }),
    correctionSession: one(extractionCorrectionSessions, {
      fields: [extractionLearningCandidates.correctionSessionId],
      references: [extractionCorrectionSessions.id],
    }),
    vendor: one(vendors, {
      fields: [extractionLearningCandidates.vendorId],
      references: [vendors.id],
    }),
  })
);

export const orgReputationRelations = relations(orgReputation, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgReputation.orgId],
    references: [organizations.id],
  }),
}));

export const exemplarConsensusRelations = relations(
  exemplarConsensus,
  ({ many }) => ({
    globalPoolEntries: many(globalExemplarPool),
  })
);

export const globalExemplarPoolRelations = relations(
  globalExemplarPool,
  ({ one }) => ({
    consensus: one(exemplarConsensus, {
      fields: [globalExemplarPool.consensusId],
      references: [exemplarConsensus.id],
    }),
  })
);
