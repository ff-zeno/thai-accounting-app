import { describe, expect, it } from "vitest";
import {
  assertPostingKindForOutboxEvent,
  getPostingKindsForOutboxEvent,
} from "./posting-kind-dispatch";

describe("posting kind dispatch", () => {
  it("maps supported posting outbox events to accepted posting kinds", () => {
    expect(getPostingKindsForOutboxEvent("sales_transactions", "create")).toEqual([
      "pos_primary_sale",
    ]);
    expect(getPostingKindsForOutboxEvent("tax_payment_events", "payment")).toEqual([
      "tax_payment_pp30",
      "tax_payment_pp36",
    ]);
    expect(getPostingKindsForOutboxEvent("inventory_movements", "post_gl")).toEqual([
      "inventory_cogs",
      "inventory_purchase",
      "inventory_count_variance",
    ]);
    expect(
      getPostingKindsForOutboxEvent("fixed_asset_depreciation_period", "post")
    ).toEqual(["depreciation"]);
    expect(
      getPostingKindsForOutboxEvent("import_charge_documents", "create")
    ).toEqual(["import_broker_invoice"]);
  });

  it("rejects missing and mismatched posting kind declarations", () => {
    expect(() =>
      assertPostingKindForOutboxEvent({
        sourceEntityType: "sales_transactions",
        eventType: "create",
        postingKind: "pos_primary_sale",
      })
    ).not.toThrow();

    expect(() =>
      assertPostingKindForOutboxEvent({
        sourceEntityType: "sales_transactions",
        eventType: "create",
        postingKind: "cash_deposit",
      })
    ).toThrow(/Posting kind mismatch/);

    expect(() =>
      assertPostingKindForOutboxEvent({
        sourceEntityType: "unknown",
        eventType: "create",
        postingKind: "cash_deposit",
      })
    ).toThrow(/No posting handler/);
  });
});
