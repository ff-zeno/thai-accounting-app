/**
 * Full data export: JSON + CSV for all org data.
 *
 * Exports ALL org data scoped to a single org_id:
 * - documents, document_line_items, vendors, transactions
 * - bank_statements, wht_certificates, wht_certificate_items
 * - payments
 * - VAT operations ledger tables and filing/payment snapshots
 * - General ledger accounts, journal entries/lines, and opening balances
 * - POS/import source-ledger tables
 *
 * Excludes soft-deleted records (deleted_at IS NULL).
 * Each table produces both a CSV and a JSON file.
 */

import { and, eq, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db/index";
import {
  documents,
  documentLineItems,
  depreciationSchedule,
  allocationRuleTargets,
  allocationRules,
  closeChecklistItems,
  closeChecklists,
  bookTaxAdjustments,
  citFilings,
  costCenters,
  copilotMessages,
  copilotSessions,
  copilotToolEvents,
  employeeAllowances,
  employees,
  fixedAssetDepreciationPeriods,
  fixedAssets,
  fxValuationLayers,
  lossCarryForwardLayers,
  orgAiSettings,
  vendors,
  transactions,
  bankStatements,
  whtCertificates,
  whtCertificateItems,
  payments,
  payRuns,
  paySlips,
  pndFilings,
  pp36Obligations,
  taxPaymentEvents,
  taxRuleVersions,
  taxTreatmentDecisions,
  transferPricingDisclosures,
  vatCreditCarryforwards,
  vatFilingLines,
  vatFilings,
  vatInputItems,
  vatOutputItems,
  glAccounts,
  glOpeningBalances,
  journalEntries,
  journalLines,
  postingExceptions,
  postingOutbox,
  cashDeposits,
  establishments,
  importChargeLines,
  importDocuments,
  importGoodsLines,
  importPackets,
  importPayments,
  inventoryCountItems,
  inventoryCounts,
  inventoryMovements,
  inventoryStatutoryOverheadComponents,
  processorSettlements,
  salesTransactions,
  skus,
  ssoFilings,
  projects,
  voucherSales,
} from "@/lib/db/schema";
import { buildCsv } from "./csv-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportFile {
  filename: string;
  content: string;
  format: "json" | "csv";
}

export interface FullExportResult {
  files: ExportFile[];
}

// ---------------------------------------------------------------------------
// Table export configuration
// ---------------------------------------------------------------------------

interface TableExportConfig {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  csvHeaders: readonly string[];
  csvKeys: readonly string[];
}

const EXPORT_TABLES: TableExportConfig[] = [
  {
    name: "documents",
    table: documents,
    csvHeaders: [
      "id", "document_number", "type", "direction", "issue_date", "due_date",
      "subtotal", "vat_amount", "total_amount", "currency", "exchange_rate",
      "total_amount_thb", "category", "status", "vat_period_year",
      "vat_period_month", "vendor_id", "related_document_id", "created_at",
    ],
    csvKeys: [
      "id", "documentNumber", "type", "direction", "issueDate", "dueDate",
      "subtotal", "vatAmount", "totalAmount", "currency", "exchangeRate",
      "totalAmountThb", "category", "status", "vatPeriodYear",
      "vatPeriodMonth", "vendorId", "relatedDocumentId", "createdAt",
    ],
  },
  {
    name: "document_line_items",
    table: documentLineItems,
    csvHeaders: [
      "id", "document_id", "description", "quantity", "unit_price", "amount",
      "vat_amount", "wht_rate", "wht_amount", "wht_type",
      "rd_payment_type_code", "account_code",
    ],
    csvKeys: [
      "id", "documentId", "description", "quantity", "unitPrice", "amount",
      "vatAmount", "whtRate", "whtAmount", "whtType",
      "rdPaymentTypeCode", "accountCode",
    ],
  },
  {
    name: "vendors",
    table: vendors,
    csvHeaders: [
      "id", "name", "name_th", "display_alias", "tax_id", "registration_no",
      "branch_number", "address", "address_th", "email",
      "payment_terms_days", "is_vat_registered", "entity_type", "country",
      "created_at",
    ],
    csvKeys: [
      "id", "name", "nameTh", "displayAlias", "taxId", "registrationNo",
      "branchNumber", "address", "addressTh", "email",
      "paymentTermsDays", "isVatRegistered", "entityType", "country",
      "createdAt",
    ],
  },
  {
    name: "org_ai_settings",
    table: orgAiSettings,
    csvHeaders: [
      "id", "extraction_model", "classification_model", "translation_model",
      "monthly_budget_usd", "budget_alert_threshold", "reconciliation_budget_usd",
      "reconciliation_model", "copilot_provider", "copilot_model",
      "copilot_monthly_budget_usd", "copilot_live_model_enabled",
      "copilot_write_tools_enabled", "created_at",
    ],
    csvKeys: [
      "id", "extractionModel", "classificationModel", "translationModel",
      "monthlyBudgetUsd", "budgetAlertThreshold", "reconciliationBudgetUsd",
      "reconciliationModel", "copilotProvider", "copilotModel",
      "copilotMonthlyBudgetUsd", "copilotLiveModelEnabled",
      "copilotWriteToolsEnabled", "createdAt",
    ],
  },
  {
    name: "transactions",
    table: transactions,
    csvHeaders: [
      "id", "bank_account_id", "statement_id", "date", "description", "amount",
      "type", "running_balance", "reference_no", "channel", "counterparty",
      "reconciliation_status", "is_petty_cash", "external_ref", "created_at",
    ],
    csvKeys: [
      "id", "bankAccountId", "statementId", "date", "description", "amount",
      "type", "runningBalance", "referenceNo", "channel", "counterparty",
      "reconciliationStatus", "isPettyCash", "externalRef", "createdAt",
    ],
  },
  {
    name: "bank_statements",
    table: bankStatements,
    csvHeaders: [
      "id", "bank_account_id", "period_start", "period_end",
      "opening_balance", "closing_balance", "file_url", "parser_used",
      "import_status", "created_at",
    ],
    csvKeys: [
      "id", "bankAccountId", "periodStart", "periodEnd",
      "openingBalance", "closingBalance", "fileUrl", "parserUsed",
      "importStatus", "createdAt",
    ],
  },
  {
    name: "wht_certificates",
    table: whtCertificates,
    csvHeaders: [
      "id", "certificate_no", "payee_vendor_id", "payment_date",
      "total_base_amount", "total_wht", "form_type", "status",
      "issued_date", "voided_at", "void_reason", "pdf_url", "created_at",
    ],
    csvKeys: [
      "id", "certificateNo", "payeeVendorId", "paymentDate",
      "totalBaseAmount", "totalWht", "formType", "status",
      "issuedDate", "voidedAt", "voidReason", "pdfUrl", "createdAt",
    ],
  },
  {
    name: "wht_certificate_items",
    table: whtCertificateItems,
    csvHeaders: [
      "id", "certificate_id", "document_id", "line_item_id",
      "base_amount", "wht_rate", "wht_amount", "rd_payment_type_code",
      "wht_type",
    ],
    csvKeys: [
      "id", "certificateId", "documentId", "lineItemId",
      "baseAmount", "whtRate", "whtAmount", "rdPaymentTypeCode",
      "whtType",
    ],
  },
  {
    name: "payments",
    table: payments,
    csvHeaders: [
      "id", "document_id", "payment_date", "gross_amount",
      "wht_amount_withheld", "net_amount_paid", "payment_method",
      "is_ewht", "notes", "created_at",
    ],
    csvKeys: [
      "id", "documentId", "paymentDate", "grossAmount",
      "whtAmountWithheld", "netAmountPaid", "paymentMethod",
      "isEwht", "notes", "createdAt",
    ],
  },
  {
    name: "tax_rule_versions",
    table: taxRuleVersions,
    csvHeaders: [
      "id", "rule_scope", "version", "effective_from", "effective_to",
      "source_url", "source_checked_at", "cpa_reviewed_by_user_id",
      "cpa_reviewed_at", "created_at",
    ],
    csvKeys: [
      "id", "ruleScope", "version", "effectiveFrom", "effectiveTo",
      "sourceUrl", "sourceCheckedAt", "cpaReviewedByUserId",
      "cpaReviewedAt", "createdAt",
    ],
  },
  {
    name: "tax_treatment_decisions",
    table: taxTreatmentDecisions,
    csvHeaders: [
      "id", "source_document_id", "source_document_line_id",
      "source_transaction_id", "source_payment_id",
      "source_reconciliation_match_id", "treatment_type", "review_status",
      "confidence", "confirmed_by_user_id", "confirmed_at", "created_at",
    ],
    csvKeys: [
      "id", "sourceDocumentId", "sourceDocumentLineId",
      "sourceTransactionId", "sourcePaymentId",
      "sourceReconciliationMatchId", "treatmentType", "reviewStatus",
      "confidence", "confirmedByUserId", "confirmedAt", "createdAt",
    ],
  },
  {
    name: "vat_input_items",
    table: vatInputItems,
    csvHeaders: [
      "id", "source_document_id", "source_document_line_id", "vendor_id",
      "tax_invoice_no", "tax_invoice_date", "tax_invoice_subtype",
      "base_amount", "vat_amount", "vat_rate", "eligible_period_year",
      "eligible_period_month", "expiry_period_year", "expiry_period_month",
      "claim_period_year", "claim_period_month", "status", "draft_filing_id",
      "filed_filing_line_id", "source_snapshot_hash", "created_at",
    ],
    csvKeys: [
      "id", "sourceDocumentId", "sourceDocumentLineId", "vendorId",
      "taxInvoiceNo", "taxInvoiceDate", "taxInvoiceSubtype",
      "baseAmount", "vatAmount", "vatRate", "eligiblePeriodYear",
      "eligiblePeriodMonth", "expiryPeriodYear", "expiryPeriodMonth",
      "claimPeriodYear", "claimPeriodMonth", "status", "draftFilingId",
      "filedFilingLineId", "sourceSnapshotHash", "createdAt",
    ],
  },
  {
    name: "vat_output_items",
    table: vatOutputItems,
    csvHeaders: [
      "id", "source_document_id", "source_document_line_id",
      "source_transaction_id", "customer_id", "tax_invoice_no",
      "tax_invoice_date", "tax_point_date", "tax_point_basis",
      "output_period_year", "output_period_month", "base_amount",
      "vat_amount", "vat_rate", "status", "source_snapshot_hash",
      "created_at",
    ],
    csvKeys: [
      "id", "sourceDocumentId", "sourceDocumentLineId",
      "sourceTransactionId", "customerId", "taxInvoiceNo",
      "taxInvoiceDate", "taxPointDate", "taxPointBasis",
      "outputPeriodYear", "outputPeriodMonth", "baseAmount",
      "vatAmount", "vatRate", "status", "sourceSnapshotHash",
      "createdAt",
    ],
  },
  {
    name: "pp36_obligations",
    table: pp36Obligations,
    csvHeaders: [
      "id", "source_document_id", "source_document_line_id",
      "source_payment_transaction_id", "vendor_id", "vendor_country_code",
      "service_description", "base_amount_thb", "vat_amount", "vat_rate",
      "tax_point_date", "pp36_period_year", "pp36_period_month", "status",
      "pp36_filing_id", "pp36_filing_line_id", "pp36_paid_at",
      "pp30_reclaim_eligible_period_year", "pp30_reclaim_eligible_period_month",
      "pp30_reclaim_expiry_period_year", "pp30_reclaim_expiry_period_month",
      "pp30_reclaim_filing_id", "pp30_reclaim_filing_line_id",
      "source_snapshot_hash", "created_at",
    ],
    csvKeys: [
      "id", "sourceDocumentId", "sourceDocumentLineId",
      "sourcePaymentTransactionId", "vendorId", "vendorCountryCode",
      "serviceDescription", "baseAmountThb", "vatAmount", "vatRate",
      "taxPointDate", "pp36PeriodYear", "pp36PeriodMonth", "status",
      "pp36FilingId", "pp36FilingLineId", "pp36PaidAt",
      "pp30ReclaimEligiblePeriodYear", "pp30ReclaimEligiblePeriodMonth",
      "pp30ReclaimExpiryPeriodYear", "pp30ReclaimExpiryPeriodMonth",
      "pp30ReclaimFilingId", "pp30ReclaimFilingLineId",
      "sourceSnapshotHash", "createdAt",
    ],
  },
  {
    name: "vat_filings",
    table: vatFilings,
    csvHeaders: [
      "id", "filing_type", "period_year", "period_month", "filing_kind",
      "version", "amends_filing_id", "status", "output_vat_total",
      "input_vat_total", "pp36_vat_total", "pp36_reclaim_total",
      "carryforward_in", "carryforward_out", "net_payable", "refund_amount",
      "payment_status", "filed_at", "filed_by_user_id", "paid_at",
      "rd_receipt_no", "created_at",
    ],
    csvKeys: [
      "id", "filingType", "periodYear", "periodMonth", "filingKind",
      "version", "amendsFilingId", "status", "outputVatTotal",
      "inputVatTotal", "pp36VatTotal", "pp36ReclaimTotal",
      "carryforwardIn", "carryforwardOut", "netPayable", "refundAmount",
      "paymentStatus", "filedAt", "filedByUserId", "paidAt",
      "rdReceiptNo", "createdAt",
    ],
  },
  {
    name: "vat_filing_lines",
    table: vatFilingLines,
    csvHeaders: [
      "id", "filing_id", "line_type", "vat_input_item_id",
      "vat_output_item_id", "pp36_obligation_id", "amount", "vat_amount",
      "frozen_snapshot_hash", "created_at",
    ],
    csvKeys: [
      "id", "filingId", "lineType", "vatInputItemId",
      "vatOutputItemId", "pp36ObligationId", "amount", "vatAmount",
      "frozenSnapshotHash", "createdAt",
    ],
  },
  {
    name: "vat_credit_carryforwards",
    table: vatCreditCarryforwards,
    csvHeaders: [
      "id", "source_pp30_filing_id", "source_pp30_filing_line_id",
      "credit_origin_period_year", "credit_origin_period_month", "amount",
      "remaining_amount", "applied_to_pp30_filing_id", "status", "created_at",
    ],
    csvKeys: [
      "id", "sourcePp30FilingId", "sourcePp30FilingLineId",
      "creditOriginPeriodYear", "creditOriginPeriodMonth", "amount",
      "remainingAmount", "appliedToPp30FilingId", "status", "createdAt",
    ],
  },
  {
    name: "tax_payment_events",
    table: taxPaymentEvents,
    csvHeaders: [
      "id", "filing_id", "event_type", "event_status",
      "payment_transaction_id", "paid_at", "amount", "receipt_no",
      "evidence_document_id", "idempotency_key", "created_by_user_id",
      "created_at",
    ],
    csvKeys: [
      "id", "filingId", "eventType", "eventStatus",
      "paymentTransactionId", "paidAt", "amount", "receiptNo",
      "evidenceDocumentId", "idempotencyKey", "createdByUserId",
      "createdAt",
    ],
  },
  {
    name: "gl_accounts",
    table: glAccounts,
    csvHeaders: [
      "id", "account_code", "name_th", "name_en", "account_type",
      "account_subtype", "parent_account_id", "is_clearing",
      "is_control_account", "is_active", "is_system", "is_automated",
      "is_postable", "tax_treatment", "vat_register_role",
      "wht_register_role", "created_at",
    ],
    csvKeys: [
      "id", "accountCode", "nameTh", "nameEn", "accountType",
      "accountSubtype", "parentAccountId", "isClearing",
      "isControlAccount", "isActive", "isSystem", "isAutomated",
      "isPostable", "taxTreatment", "vatRegisterRole",
      "whtRegisterRole", "createdAt",
    ],
  },
  {
    name: "journal_entries",
    table: journalEntries,
    csvHeaders: [
      "id", "entry_number", "entry_date", "posting_date",
      "period_year", "period_month", "entry_type", "posting_kind",
      "source_entity_type", "source_entity_id", "description", "currency",
      "total_debit", "total_credit", "created_by_user_id", "posted_at",
      "is_reversal", "reverses_entry_id", "created_at",
    ],
    csvKeys: [
      "id", "entryNumber", "entryDate", "postingDate",
      "periodYear", "periodMonth", "entryType", "postingKind",
      "sourceEntityType", "sourceEntityId", "description", "currency",
      "totalDebit", "totalCredit", "createdByUserId", "postedAt",
      "isReversal", "reversesEntryId", "createdAt",
    ],
  },
  {
    name: "journal_lines",
    table: journalLines,
    csvHeaders: [
      "id", "journal_entry_id", "line_number", "account_id",
      "description", "debit_amount", "credit_amount",
      "subledger_entity_type", "subledger_entity_id", "channel_key",
      "processor_key", "cash_deposit_key", "boi_segment", "created_at",
    ],
    csvKeys: [
      "id", "journalEntryId", "lineNumber", "accountId",
      "description", "debitAmount", "creditAmount",
      "subledgerEntityType", "subledgerEntityId", "channelKey",
      "processorKey", "cashDepositKey", "boiSegment", "createdAt",
    ],
  },
  {
    name: "posting_outbox",
    table: postingOutbox,
    csvHeaders: [
      "id", "source_entity_type", "source_entity_id", "event_type",
      "posting_status", "posting_attempts", "last_attempt_at",
      "last_error", "journal_entry_id", "created_at",
    ],
    csvKeys: [
      "id", "sourceEntityType", "sourceEntityId", "eventType",
      "postingStatus", "postingAttempts", "lastAttemptAt",
      "lastError", "journalEntryId", "createdAt",
    ],
  },
  {
    name: "posting_exceptions",
    table: postingExceptions,
    csvHeaders: [
      "id", "posting_outbox_id", "source_entity_type", "source_entity_id",
      "failure_class", "message", "resolved_at", "resolution", "created_at",
    ],
    csvKeys: [
      "id", "postingOutboxId", "sourceEntityType", "sourceEntityId",
      "failureClass", "message", "resolvedAt", "resolution", "createdAt",
    ],
  },
  {
    name: "gl_opening_balances",
    table: glOpeningBalances,
    csvHeaders: [
      "id", "establishment_id", "as_of_date", "account_id",
      "debit_amount", "credit_amount", "entered_by_user_id", "notes",
      "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "asOfDate", "accountId",
      "debitAmount", "creditAmount", "enteredByUserId", "notes",
      "createdAt",
    ],
  },
  {
    name: "establishments",
    table: establishments,
    csvHeaders: [
      "id", "branch_number", "name_th", "name_en", "is_head_office",
      "requires_manual_mapping", "consolidated_filing_approved",
      "vat_registered", "tax_id", "created_at",
    ],
    csvKeys: [
      "id", "branchNumber", "nameTh", "nameEn", "isHeadOffice",
      "requiresManualMapping", "consolidatedFilingApproved",
      "vatRegistered", "taxId", "createdAt",
    ],
  },
  {
    name: "sales_transactions",
    table: salesTransactions,
    csvHeaders: [
      "id", "establishment_id", "event_role", "source", "external_id",
      "sold_at", "channel", "pricing_mode", "amount_including_vat",
      "tax_base_ex_vat", "vat_amount", "vat_rate", "tax_invoice_type",
      "tax_invoice_number", "terminal_id", "clearing_account_key",
      "settlement_status", "settled_transaction_id", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "eventRole", "source", "externalId",
      "soldAt", "channel", "pricingMode", "amountIncludingVat",
      "taxBaseExVat", "vatAmount", "vatRate", "taxInvoiceType",
      "taxInvoiceNumber", "terminalId", "clearingAccountKey",
      "settlementStatus", "settledTransactionId", "createdAt",
    ],
  },
  {
    name: "voucher_sales",
    table: voucherSales,
    csvHeaders: [
      "id", "establishment_id", "sold_at", "voucher_code",
      "face_value", "payment_received", "expires_at", "redeemed_at",
      "redemption_sales_transaction_id", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "soldAt", "voucherCode",
      "faceValue", "paymentReceived", "expiresAt", "redeemedAt",
      "redemptionSalesTransactionId", "createdAt",
    ],
  },
  {
    name: "processor_settlements",
    table: processorSettlements,
    csvHeaders: [
      "id", "establishment_id", "processor", "external_id",
      "period_start", "period_end", "gross_amount", "fee_amount",
      "fee_vat_amount", "net_payout", "processor_tax_invoice_document_id",
      "bank_transaction_id", "reconciliation_status",
      "reconciliation_discrepancy", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "processor", "externalId",
      "periodStart", "periodEnd", "grossAmount", "feeAmount",
      "feeVatAmount", "netPayout", "processorTaxInvoiceDocumentId",
      "bankTransactionId", "reconciliationStatus",
      "reconciliationDiscrepancy", "createdAt",
    ],
  },
  {
    name: "cash_deposits",
    table: cashDeposits,
    csvHeaders: [
      "id", "establishment_id", "deposit_slip_document_id",
      "deposited_at", "deposited_by", "bank_account_id", "amount",
      "slip_reference", "bank_transaction_id", "pos_cash_period_start",
      "pos_cash_period_end", "cash_variance",
      "variance_resolution_status", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "depositSlipDocumentId",
      "depositedAt", "depositedBy", "bankAccountId", "amount",
      "slipReference", "bankTransactionId", "posCashPeriodStart",
      "posCashPeriodEnd", "cashVariance",
      "varianceResolutionStatus", "createdAt",
    ],
  },
  {
    name: "imports",
    table: importPackets,
    csvHeaders: [
      "id", "establishment_id", "import_reference", "supplier_vendor_id",
      "customs_declaration_number", "arrival_port", "arrival_date",
      "customs_clearance_date", "original_currency", "fx_rate_at_clearance",
      "cif_original", "cif_thb", "customs_assessed_duty_thb",
      "customs_assessed_excise_thb", "customs_assessed_import_vat_thb",
      "is_finalized", "finalized_at", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "importReference", "supplierVendorId",
      "customsDeclarationNumber", "arrivalPort", "arrivalDate",
      "customsClearanceDate", "originalCurrency", "fxRateAtClearance",
      "cifOriginal", "cifThb", "customsAssessedDutyThb",
      "customsAssessedExciseThb", "customsAssessedImportVatThb",
      "isFinalized", "finalizedAt", "createdAt",
    ],
  },
  {
    name: "import_documents",
    table: importDocuments,
    csvHeaders: [
      "id", "import_id", "document_id", "document_role", "notes",
      "created_at",
    ],
    csvKeys: [
      "id", "importId", "documentId", "documentRole", "notes", "createdAt",
    ],
  },
  {
    name: "import_goods_lines",
    table: importGoodsLines,
    csvHeaders: [
      "id", "import_id", "sku_id", "sku_code", "description", "quantity",
      "unit_price_original", "goods_value_original", "goods_value_thb",
      "weight_kg", "lot_sequence", "created_at",
    ],
    csvKeys: [
      "id", "importId", "skuId", "skuCode", "description", "quantity",
      "unitPriceOriginal", "goodsValueOriginal", "goodsValueThb",
      "weightKg", "lotSequence", "createdAt",
    ],
  },
  {
    name: "import_charge_lines",
    table: importChargeLines,
    csvHeaders: [
      "id", "import_id", "source_document_id", "line_description",
      "amount_thb", "original_currency", "original_amount",
      "fx_rate_applied", "fx_source", "fx_date", "vat_treatment",
      "vat_amount_thb", "expense_account_id", "vat_period_override",
      "late_claim_reason", "created_at",
    ],
    csvKeys: [
      "id", "importId", "sourceDocumentId", "lineDescription",
      "amountThb", "originalCurrency", "originalAmount", "fxRateApplied",
      "fxSource", "fxDate", "vatTreatment", "vatAmountThb",
      "expenseAccountId", "vatPeriodOverride", "lateClaimReason", "createdAt",
    ],
  },
  {
    name: "import_payments",
    table: importPayments,
    csvHeaders: [
      "id", "import_id", "bank_transaction_id", "payment_role",
      "amount_thb", "created_at",
    ],
    csvKeys: [
      "id", "importId", "bankTransactionId", "paymentRole", "amountThb",
      "createdAt",
    ],
  },
  {
    name: "skus",
    table: skus,
    csvHeaders: [
      "id", "establishment_id", "sku_code", "barcode_ean13", "name_th",
      "name_en", "category", "valuation_method", "unit_of_measure",
      "current_quantity", "current_avg_cost", "last_known_avg_cost",
      "standard_cost", "reorder_point_quantity", "current_value",
      "last_movement_at", "is_inventoriable", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "skuCode", "barcodeEan13", "nameTh",
      "nameEn", "category", "valuationMethod", "unitOfMeasure",
      "currentQuantity", "currentAvgCost", "lastKnownAvgCost",
      "standardCost", "reorderPointQuantity", "currentValue",
      "lastMovementAt", "isInventoriable", "createdAt",
    ],
  },
  {
    name: "inventory_movements",
    table: inventoryMovements,
    csvHeaders: [
      "id", "establishment_id", "sku_id", "movement_at", "movement_type",
      "quantity", "unit_cost", "total_cost", "running_quantity_after",
      "running_avg_cost_after", "running_value_after", "source_entity_type",
      "source_entity_id", "journal_entry_id", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "skuId", "movementAt", "movementType",
      "quantity", "unitCost", "totalCost", "runningQuantityAfter",
      "runningAvgCostAfter", "runningValueAfter", "sourceEntityType",
      "sourceEntityId", "journalEntryId", "createdAt",
    ],
  },
  {
    name: "inventory_counts",
    table: inventoryCounts,
    csvHeaders: [
      "id", "establishment_id", "count_date", "count_type", "status",
      "submitted_at", "reconciled_at", "reconciled_by_user_id",
      "total_variance_value_thb", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "countDate", "countType", "status",
      "submittedAt", "reconciledAt", "reconciledByUserId",
      "totalVarianceValueThb", "createdAt",
    ],
  },
  {
    name: "inventory_count_items",
    table: inventoryCountItems,
    csvHeaders: [
      "id", "count_id", "sku_id", "system_quantity", "counted_quantity",
      "variance", "variance_value_thb", "variance_reason", "created_at",
    ],
    csvKeys: [
      "id", "countId", "skuId", "systemQuantity", "countedQuantity",
      "variance", "varianceValueThb", "varianceReason", "createdAt",
    ],
  },
  {
    name: "inventory_statutory_overhead_components",
    table: inventoryStatutoryOverheadComponents,
    csvHeaders: [
      "id", "import_id", "import_goods_line_id", "import_charge_line_id",
      "sku_id", "component_type", "component_amount_thb",
      "remaining_amount_thb", "fiscal_year", "created_at",
    ],
    csvKeys: [
      "id", "importId", "importGoodsLineId", "importChargeLineId",
      "skuId", "componentType", "componentAmountThb", "remainingAmountThb",
      "fiscalYear", "createdAt",
    ],
  },
  {
    name: "fixed_assets",
    table: fixedAssets,
    csvHeaders: [
      "id", "establishment_id", "asset_code", "name_th", "name_en",
      "category", "acquisition_date", "original_cost", "salvage_value",
      "useful_life_months", "tax_useful_life_months_minimum",
      "depreciation_method", "depreciation_start_date", "disposed_at",
      "location", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "assetCode", "nameTh", "nameEn",
      "category", "acquisitionDate", "originalCost", "salvageValue",
      "usefulLifeMonths", "taxUsefulLifeMonthsMinimum",
      "depreciationMethod", "depreciationStartDate", "disposedAt",
      "location", "createdAt",
    ],
  },
  {
    name: "depreciation_schedule",
    table: depreciationSchedule,
    csvHeaders: [
      "id", "fixed_asset_id", "period_year", "period_month",
      "depreciation_amount", "tax_depreciation_capped_amount",
      "book_tax_difference", "accumulated_depreciation_after",
      "book_value_after", "journal_entry_id", "posted_at", "created_at",
    ],
    csvKeys: [
      "id", "fixedAssetId", "periodYear", "periodMonth",
      "depreciationAmount", "taxDepreciationCappedAmount",
      "bookTaxDifference", "accumulatedDepreciationAfter",
      "bookValueAfter", "journalEntryId", "postedAt", "createdAt",
    ],
  },
  {
    name: "fixed_asset_depreciation_periods",
    table: fixedAssetDepreciationPeriods,
    csvHeaders: [
      "id", "period_year", "period_month", "schedule_rows_created",
      "posting_outbox_id", "journal_entry_id", "created_by_user_id",
      "requested_at", "posted_at", "created_at",
    ],
    csvKeys: [
      "id", "periodYear", "periodMonth", "scheduleRowsCreated",
      "postingOutboxId", "journalEntryId", "createdByUserId",
      "requestedAt", "postedAt", "createdAt",
    ],
  },
  {
    name: "close_checklists",
    table: closeChecklists,
    csvHeaders: [
      "id", "establishment_id", "period_year", "period_month", "status",
      "closed_at", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "periodYear", "periodMonth", "status",
      "closedAt", "createdAt",
    ],
  },
  {
    name: "close_checklist_items",
    table: closeChecklistItems,
    csvHeaders: [
      "id", "checklist_id", "sequence", "item_key", "description",
      "status", "assigned_to_user_id", "completed_by_user_id",
      "completed_at", "created_at",
    ],
    csvKeys: [
      "id", "checklistId", "sequence", "itemKey", "description",
      "status", "assignedToUserId", "completedByUserId", "completedAt",
      "createdAt",
    ],
  },
  {
    name: "cost_centers",
    table: costCenters,
    csvHeaders: [
      "id", "code", "name_th", "name_en", "parent_id", "is_active",
      "created_at",
    ],
    csvKeys: [
      "id", "code", "nameTh", "nameEn", "parentId", "isActive",
      "createdAt",
    ],
  },
  {
    name: "projects",
    table: projects,
    csvHeaders: [
      "id", "code", "name_th", "name_en", "customer_vendor_id",
      "start_date", "end_date", "status", "is_active", "created_at",
    ],
    csvKeys: [
      "id", "code", "nameTh", "nameEn", "customerVendorId",
      "startDate", "endDate", "status", "isActive", "createdAt",
    ],
  },
  {
    name: "allocation_rules",
    table: allocationRules,
    csvHeaders: [
      "id", "rule_name", "source_type", "source_id", "source_key", "is_active",
      "effective_from", "effective_to", "created_at",
    ],
    csvKeys: [
      "id", "ruleName", "sourceType", "sourceId", "sourceKey", "isActive",
      "effectiveFrom", "effectiveTo", "createdAt",
    ],
  },
  {
    name: "allocation_rule_targets",
    table: allocationRuleTargets,
    csvHeaders: [
      "id", "allocation_rule_id", "cost_center_id", "project_id",
      "percentage", "notes", "created_at",
    ],
    csvKeys: [
      "id", "allocationRuleId", "costCenterId", "projectId",
      "percentage", "notes", "createdAt",
    ],
  },
  {
    name: "fx_valuation_layers",
    table: fxValuationLayers,
    csvHeaders: [
      "id", "monetary_item_type", "monetary_item_id", "original_amount",
      "original_currency", "valuation_date", "valuation_rate",
      "valued_thb_amount", "prior_valuation_id", "journal_entry_id",
      "realized", "created_at",
    ],
    csvKeys: [
      "id", "monetaryItemType", "monetaryItemId", "originalAmount",
      "originalCurrency", "valuationDate", "valuationRate",
      "valuedThbAmount", "priorValuationId", "journalEntryId",
      "realized", "createdAt",
    ],
  },
  {
    name: "cit_filings",
    table: citFilings,
    csvHeaders: [
      "id", "tax_year", "filing_type", "period_start", "period_end",
      "filing_status", "accounting_profit", "taxable_income",
      "cit_calculated", "cit_payable", "pnd51_method", "created_at",
    ],
    csvKeys: [
      "id", "taxYear", "filingType", "periodStart", "periodEnd",
      "filingStatus", "accountingProfit", "taxableIncome",
      "citCalculated", "citPayable", "pnd51Method", "createdAt",
    ],
  },
  {
    name: "book_tax_adjustments",
    table: bookTaxAdjustments,
    csvHeaders: [
      "id", "tax_year", "description", "gl_account_id", "amount",
      "direction", "category", "created_at",
    ],
    csvKeys: [
      "id", "taxYear", "description", "glAccountId", "amount",
      "direction", "category", "createdAt",
    ],
  },
  {
    name: "loss_carry_forward_layers",
    table: lossCarryForwardLayers,
    csvHeaders: [
      "id", "originated_tax_year", "expiry_tax_year", "original_amount",
      "remaining_amount", "expired_at", "created_at",
    ],
    csvKeys: [
      "id", "originatedTaxYear", "expiryTaxYear", "originalAmount",
      "remainingAmount", "expiredAt", "createdAt",
    ],
  },
  {
    name: "transfer_pricing_disclosures",
    table: transferPricingDisclosures,
    csvHeaders: [
      "id", "tax_year", "status", "revenue_total",
      "disclosure_required", "related_party_transactions_payload",
      "notes", "prepared_by_user_id", "submitted_at", "created_at",
    ],
    csvKeys: [
      "id", "taxYear", "status", "revenueTotal",
      "disclosureRequired", "relatedPartyTransactionsPayload",
      "notes", "preparedByUserId", "submittedAt", "createdAt",
    ],
  },
  {
    name: "copilot_sessions",
    table: copilotSessions,
    csvHeaders: [
      "id", "user_id", "title", "status", "created_at",
    ],
    csvKeys: [
      "id", "userId", "title", "status", "createdAt",
    ],
  },
  {
    name: "copilot_messages",
    table: copilotMessages,
    csvHeaders: [
      "id", "session_id", "role", "content", "tool_name", "created_at",
    ],
    csvKeys: [
      "id", "sessionId", "role", "content", "toolName", "createdAt",
    ],
  },
  {
    name: "copilot_tool_events",
    table: copilotToolEvents,
    csvHeaders: [
      "id", "session_id", "tool_name", "risk", "preview_required",
      "status", "created_by_user_id", "created_at",
    ],
    csvKeys: [
      "id", "sessionId", "toolName", "risk", "previewRequired",
      "status", "createdByUserId", "createdAt",
    ],
  },
  {
    name: "employees",
    table: employees,
    csvHeaders: [
      "id", "establishment_id", "tax_id", "full_name_th", "full_name_en",
      "start_date", "end_date", "position", "pay_frequency",
      "pay_periods_per_year", "provident_fund_eligible",
      "social_security_eligible", "is_director", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "taxId", "fullNameTh", "fullNameEn",
      "startDate", "endDate", "position", "payFrequency",
      "payPeriodsPerYear", "providentFundEligible", "socialSecurityEligible",
      "isDirector", "createdAt",
    ],
  },
  {
    name: "employee_allowances",
    table: employeeAllowances,
    csvHeaders: [
      "id", "employee_id", "tax_year", "personal_allowance",
      "spouse_allowance", "child_count_pre_2018",
      "child_count_post_2018_second_plus", "effective_from_month",
      "created_at",
    ],
    csvKeys: [
      "id", "employeeId", "taxYear", "personalAllowance",
      "spouseAllowance", "childCountPre2018",
      "childCountPost2018SecondPlus", "effectiveFromMonth", "createdAt",
    ],
  },
  {
    name: "pay_runs",
    table: payRuns,
    csvHeaders: [
      "id", "establishment_id", "period_start", "period_end", "pay_date",
      "status", "approved_by", "approved_at", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "periodStart", "periodEnd", "payDate",
      "status", "approvedBy", "approvedAt", "createdAt",
    ],
  },
  {
    name: "pay_slips",
    table: paySlips,
    csvHeaders: [
      "id", "establishment_id", "pay_run_id", "employee_id",
      "pnd1_income_type", "gross_salary", "bonus", "pit_wht",
      "sso_employee", "sso_employer", "net_pay", "pnd_filing_id",
      "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "payRunId", "employeeId",
      "pnd1IncomeType", "grossSalary", "bonus", "pitWht",
      "ssoEmployee", "ssoEmployer", "netPay", "pndFilingId", "createdAt",
    ],
  },
  {
    name: "pnd_filings",
    table: pndFilings,
    csvHeaders: [
      "id", "establishment_id", "form_type", "tax_period",
      "filing_status", "total_payees", "total_gross_amount",
      "total_wht_amount", "is_amendment", "rd_reference_number",
      "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "formType", "taxPeriod",
      "filingStatus", "totalPayees", "totalGrossAmount", "totalWhtAmount",
      "isAmendment", "rdReferenceNumber", "createdAt",
    ],
  },
  {
    name: "sso_filings",
    table: ssoFilings,
    csvHeaders: [
      "id", "establishment_id", "tax_month", "filing_status",
      "total_employees", "total_employee_contribution",
      "total_employer_contribution", "is_amendment",
      "sso_reference_number", "paid_at", "created_at",
    ],
    csvKeys: [
      "id", "establishmentId", "taxMonth", "filingStatus",
      "totalEmployees", "totalEmployeeContribution",
      "totalEmployerContribution", "isAmendment", "ssoReferenceNumber",
      "paidAt", "createdAt",
    ],
  },
];

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function generateFullDataExport(
  orgId: string
): Promise<FullExportResult> {
  const files: ExportFile[] = [];

  // Fetch document IDs first for defense-in-depth on child table exports
  const orgDocs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), isNull(documents.deletedAt)));
  const docIds = orgDocs.map((d) => d.id);

  for (const config of EXPORT_TABLES) {
    const conditions = [eq(config.table.orgId, orgId)];

    // Add soft-delete filter if the table has deletedAt
    if ("deletedAt" in config.table) {
      conditions.push(isNull(config.table.deletedAt));
    }

    // Defense-in-depth: restrict child tables to known document IDs
    if (
      (config.name === "document_line_items" ||
        config.name === "wht_certificate_items") &&
      "documentId" in config.table
    ) {
      if (docIds.length === 0) {
        // No documents — skip querying child tables entirely
        files.push({
          filename: `${config.name}.json`,
          content: JSON.stringify([], null, 2),
          format: "json",
        });
        files.push({
          filename: `${config.name}.csv`,
          content: buildCsv(config.csvHeaders, []),
          format: "csv",
        });
        continue;
      }
      conditions.push(inArray(config.table.documentId, docIds));
    }

    const rawRows = await db
      .select()
      .from(config.table)
      .where(and(...conditions));
    const rows = config.name === "org_ai_settings"
      ? rawRows.map((row: Record<string, unknown>) => {
          const sanitized = { ...row };
          delete sanitized.copilotApiKeySecretRef;
          delete sanitized.copilotApiKeyLast4;
          return sanitized;
        })
      : rawRows;

    // JSON export — plain array of records with camelCase keys
    files.push({
      filename: `${config.name}.json`,
      content: JSON.stringify(rows, null, 2),
      format: "json",
    });

    // CSV export — snake_case headers, camelCase key lookup
    const csvRows: string[][] = rows.map((row: Record<string, unknown>) =>
      config.csvKeys.map((key) => {
        const val = row[key];
        if (val === null || val === undefined) return "";
        if (val instanceof Date) return val.toISOString();
        return String(val);
      })
    );

    files.push({
      filename: `${config.name}.csv`,
      content: buildCsv(config.csvHeaders, csvRows),
      format: "csv",
    });
  }

  return { files };
}
