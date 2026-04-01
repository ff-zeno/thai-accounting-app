/**
 * Backfill vendor_bank_aliases from existing manual reconciliation matches.
 *
 * Queries all matched_by='manual' reconciliation matches, joins to
 * transactions (counterparty) and documents (vendorId), and seeds
 * vendor_bank_aliases with historical data.
 *
 * Usage: pnpm tsx src/lib/db/seeds/backfill-aliases.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as schema from "../schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });

  console.log("Backfilling vendor_bank_aliases from manual matches...");

  // Find all manual matches that have a counterparty and vendor
  const manualMatches = await db
    .select({
      orgId: schema.reconciliationMatches.orgId,
      counterparty: schema.transactions.counterparty,
      vendorId: schema.documents.vendorId,
    })
    .from(schema.reconciliationMatches)
    .innerJoin(
      schema.transactions,
      eq(schema.reconciliationMatches.transactionId, schema.transactions.id)
    )
    .innerJoin(
      schema.documents,
      eq(schema.reconciliationMatches.documentId, schema.documents.id)
    )
    .where(
      and(
        eq(schema.reconciliationMatches.matchedBy, "manual"),
        isNull(schema.reconciliationMatches.deletedAt)
      )
    );

  // Aggregate by (orgId, counterparty, vendorId)
  const aliasMap = new Map<
    string,
    { orgId: string; counterparty: string; vendorId: string; count: number }
  >();

  for (const match of manualMatches) {
    if (!match.counterparty || !match.vendorId) continue;

    const key = `${match.orgId}|${match.counterparty}|${match.vendorId}`;
    const existing = aliasMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      aliasMap.set(key, {
        orgId: match.orgId,
        counterparty: match.counterparty,
        vendorId: match.vendorId,
        count: 1,
      });
    }
  }

  console.log(`Found ${aliasMap.size} unique counterparty → vendor mappings`);

  let created = 0;
  let confirmed = 0;

  for (const alias of aliasMap.values()) {
    const isConfirmed = alias.count >= 2;

    await db
      .insert(schema.vendorBankAliases)
      .values({
        orgId: alias.orgId,
        vendorId: alias.vendorId,
        aliasText: alias.counterparty,
        aliasType: "counterparty",
        matchCount: alias.count,
        isConfirmed,
        source: "backfill",
        lastMatchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.vendorBankAliases.orgId,
          schema.vendorBankAliases.aliasText,
          schema.vendorBankAliases.aliasType,
        ],
        set: {
          matchCount: sql`GREATEST(${schema.vendorBankAliases.matchCount}, ${alias.count})`,
          isConfirmed: sql`CASE WHEN GREATEST(${schema.vendorBankAliases.matchCount}, ${alias.count}) >= 2 THEN true ELSE ${schema.vendorBankAliases.isConfirmed} END`,
        },
      });

    created++;
    if (isConfirmed) confirmed++;
  }

  console.log(
    `Backfill complete: ${created} aliases created, ${confirmed} auto-confirmed (matchCount >= 2)`
  );

  await pool.end();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
