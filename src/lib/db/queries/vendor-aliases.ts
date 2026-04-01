import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { vendorBankAliases } from "../schema";
import { orgScope } from "../helpers/org-scope";

// ---------------------------------------------------------------------------
// Lookup alias by counterparty text (used during matching)
// ---------------------------------------------------------------------------

export async function findAliasByText(
  orgId: string,
  aliasText: string,
  aliasType: string = "counterparty"
): Promise<{ vendorId: string; matchCount: number } | null> {
  const [row] = await db
    .select({
      vendorId: vendorBankAliases.vendorId,
      matchCount: vendorBankAliases.matchCount,
    })
    .from(vendorBankAliases)
    .where(
      and(
        ...orgScope(vendorBankAliases, orgId),
        eq(vendorBankAliases.aliasText, aliasText),
        eq(vendorBankAliases.aliasType, aliasType),
        eq(vendorBankAliases.isConfirmed, true)
      )
    )
    .limit(1);

  return row ?? null;
}

// ---------------------------------------------------------------------------
// Upsert alias (auto-learn from manual matches)
// ---------------------------------------------------------------------------

export async function upsertAlias(data: {
  orgId: string;
  vendorId: string;
  aliasText: string;
  aliasType?: string;
  source?: string;
}): Promise<{ id: string; matchCount: number; isConfirmed: boolean }> {
  const aliasType = data.aliasType ?? "counterparty";
  const source = data.source ?? "auto_learn";

  const [result] = await db
    .insert(vendorBankAliases)
    .values({
      orgId: data.orgId,
      vendorId: data.vendorId,
      aliasText: data.aliasText,
      aliasType,
      source,
      matchCount: 1,
      isConfirmed: false,
      lastMatchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        vendorBankAliases.orgId,
        vendorBankAliases.aliasText,
        vendorBankAliases.aliasType,
      ],
      set: {
        // If vendor changed (correction), reset count to 1 and update vendor.
        // If same vendor, increment count. Auto-confirm after 3 total occurrences.
        vendorId: sql`${data.vendorId}`,
        matchCount: sql`CASE
          WHEN ${vendorBankAliases.vendorId} = ${data.vendorId}
          THEN ${vendorBankAliases.matchCount} + 1
          ELSE 1
        END`,
        isConfirmed: sql`CASE
          WHEN ${vendorBankAliases.vendorId} = ${data.vendorId} AND ${vendorBankAliases.matchCount} >= 2
          THEN true
          ELSE false
        END`,
        lastMatchedAt: new Date(),
      },
    })
    .returning({
      id: vendorBankAliases.id,
      matchCount: vendorBankAliases.matchCount,
      isConfirmed: vendorBankAliases.isConfirmed,
    });

  return result;
}

// ---------------------------------------------------------------------------
// List aliases for a vendor (settings UI)
// ---------------------------------------------------------------------------

export async function listAliasesForVendor(
  orgId: string,
  vendorId: string
) {
  return db
    .select()
    .from(vendorBankAliases)
    .where(
      and(
        ...orgScope(vendorBankAliases, orgId),
        eq(vendorBankAliases.vendorId, vendorId)
      )
    )
    .orderBy(vendorBankAliases.matchCount);
}

// ---------------------------------------------------------------------------
// List all confirmed aliases for org (used in bulk matching)
// ---------------------------------------------------------------------------

export async function listConfirmedAliases(orgId: string) {
  return db
    .select({
      aliasText: vendorBankAliases.aliasText,
      aliasType: vendorBankAliases.aliasType,
      vendorId: vendorBankAliases.vendorId,
    })
    .from(vendorBankAliases)
    .where(
      and(
        ...orgScope(vendorBankAliases, orgId),
        eq(vendorBankAliases.isConfirmed, true)
      )
    );
}

// ---------------------------------------------------------------------------
// Soft-delete alias
// ---------------------------------------------------------------------------

export async function deleteAlias(orgId: string, aliasId: string) {
  await db
    .update(vendorBankAliases)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(vendorBankAliases.id, aliasId),
        eq(vendorBankAliases.orgId, orgId),
        isNull(vendorBankAliases.deletedAt)
      )
    );
}
