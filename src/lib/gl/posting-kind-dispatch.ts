import type { PostingKind } from "@/lib/db/queries/general-ledger";

const POSTING_KIND_DISPATCH = {
  "wht_credits_received:create": ["wht_credit_received"],
  "tax_payment_events:payment": ["tax_payment_pp30", "tax_payment_pp36"],
  "cash_deposits:create": ["cash_deposit"],
  "sales_transactions:create": ["pos_primary_sale"],
  "processor_settlements:create": ["processor_settlement"],
  "import_charge_documents:create": ["import_broker_invoice"],
  "import_payments:create": ["import_payment_clearing"],
  "inventory_movements:post_gl": [
    "inventory_cogs",
    "inventory_purchase",
    "inventory_count_variance",
  ],
  "cit_filings:accrual": ["cit_accrual"],
  "cit_filings:payment": ["cit_payment"],
  "pay_run:payment": ["payroll_net_payment"],
  "pnd_filing:payment": ["payroll_pnd1_remittance"],
  "sso_filing:payment": ["payroll_sso_remittance"],
  "fixed_asset_depreciation_period:post": ["depreciation"],
} as const satisfies Record<string, readonly PostingKind[]>;

export function getPostingKindsForOutboxEvent(
  sourceEntityType: string,
  eventType: string
): readonly PostingKind[] | null {
  return (
    POSTING_KIND_DISPATCH[
      `${sourceEntityType}:${eventType}` as keyof typeof POSTING_KIND_DISPATCH
    ] ?? null
  );
}

export function assertPostingKindForOutboxEvent(data: {
  sourceEntityType: string;
  eventType: string;
  postingKind: PostingKind | null;
}) {
  const expected = getPostingKindsForOutboxEvent(
    data.sourceEntityType,
    data.eventType
  );
  if (!expected) {
    throw new Error(
      `No posting handler for ${data.sourceEntityType}:${data.eventType}`
    );
  }
  if (!data.postingKind || !expected.includes(data.postingKind)) {
    throw new Error(
      `Posting kind mismatch for ${data.sourceEntityType}:${data.eventType}: expected ${expected.join(
        " or "
      )}, got ${data.postingKind ?? "null"}`
    );
  }
}
