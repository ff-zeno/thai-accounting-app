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
    role: text("role").default("member"), // member, admin, owner
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

// ---------------------------------------------------------------------------
// VAT Tables
// ---------------------------------------------------------------------------

export const vatRecords = pgTable(
  "vat_records",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    outputVat: numeric("output_vat", { precision: 14, scale: 2 }),
    inputVatPp30: numeric("input_vat_pp30", { precision: 14, scale: 2 }),
    pp36ReverseCharge: numeric("pp36_reverse_charge", { precision: 14, scale: 2 }),
    netVatPayable: numeric("net_vat_payable", { precision: 14, scale: 2 }),
    pp30Status: filingStatusEnum("pp30_status").default("draft"),
    pp30Deadline: date("pp30_deadline"),
    pp36Status: filingStatusEnum("pp36_status").default("draft"),
    pp36Deadline: date("pp36_deadline"),
    nilFilingRequired: boolean("nil_filing_required").default(false),
    periodLocked: boolean("period_locked").default(false),
    createdAt,
    updatedAt,
    deletedAt,
  },
  (t) => [unique("vat_org_period").on(t.orgId, t.periodYear, t.periodMonth)]
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
  (t) => [unique("tax_config_key").on(t.key)]
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
    userCorrected: boolean("user_corrected").notNull(),
    correctionCount: integer("correction_count").notNull().default(0),
    reviewedByUserId: text("reviewed_by_user_id").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
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
  vatRecords: many(vatRecords),
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

export const vatRecordsRelations = relations(vatRecords, ({ one }) => ({
  organization: one(organizations, {
    fields: [vatRecords.orgId],
    references: [organizations.id],
  }),
}));

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
