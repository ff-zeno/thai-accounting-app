/**
 * Phase 8 Dogfood — seed Tier 1 exemplars into the real DB.
 *
 * For each vendor group in ground-truth.json:
 *   1. Pick the FIRST doc in the group as the seed.
 *   2. Upsert a vendor (find by tax_id; create if missing; fall back to
 *      name match when tax_id is null, e.g. Zeno Marketing HK).
 *   3. Insert a synthetic documents row with `category='dogfood'` so it's
 *      trivially findable for cleanup later.
 *   4. For every corrected field, call upsertExemplar() with the production
 *      signature. Uncorrected fields still write an exemplar (was_corrected=false)
 *      so getTopExemplars can see the vendor's history.
 *   5. promoteVendorTier(orgId, vendorId, 1).
 *
 * Usage:
 *   pnpm tsx benchmarks/dogfood/seed-tier1.ts <outDir> --org-id <uuid> [--dry-run]
 *   pnpm tsx benchmarks/dogfood/seed-tier1.ts <outDir> --org-id <uuid> --cleanup [--dry-run]
 *
 * Flags:
 *   --org-id     DB uuid of the target organization. REQUIRED.
 *   --dry-run    Print what would be written; touch nothing.
 *   --cleanup    Soft-delete every dogfood-category document + its exemplars
 *                for the given org. Does NOT demote vendor_tier (harmless to leave).
 *   --seed-all   Seed every doc, not just the first per vendor group (default: off).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../src/lib/db";
import {
  documents,
  extractionExemplars,
  vendors as vendorsTable,
} from "../../src/lib/db/schema";
import {
  createVendor,
  findVendorByTaxId,
} from "../../src/lib/db/queries/vendors";
import { upsertExemplar } from "../../src/lib/db/queries/extraction-exemplars";
import { promoteVendorTier } from "../../src/lib/db/queries/vendor-tier";
import {
  LEARNABLE_INVOICE_FIELDS,
  getFieldCriticality,
} from "../../src/lib/ai/field-criticality";
import { fieldValuesEqual } from "../../src/lib/ai/field-normalization";
import type { GroundTruthFile, GroundTruthDoc } from "./parse-review";

const DOGFOOD_CATEGORY = "dogfood";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  outDir: string;
  orgId: string;
  dryRun: boolean;
  cleanup: boolean;
  seedAll: boolean;
}

function parseCli(argv: string[]): CliArgs {
  const outDir = argv[0];
  if (!outDir) {
    console.error(
      "Usage: pnpm tsx benchmarks/dogfood/seed-tier1.ts <outDir> --org-id <uuid> [--dry-run] [--cleanup] [--seed-all]"
    );
    process.exit(1);
  }
  let orgId = "";
  let dryRun = false;
  let cleanup = false;
  let seedAll = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--org-id") orgId = argv[++i];
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--cleanup") cleanup = true;
    else if (a === "--seed-all") seedAll = true;
  }
  if (!orgId) {
    console.error("--org-id <uuid> is required");
    process.exit(1);
  }
  return { outDir, orgId, dryRun, cleanup, seedAll };
}

// ---------------------------------------------------------------------------
// Cleanup path (soft-delete dogfood-category docs + their exemplars)
// ---------------------------------------------------------------------------

async function cleanup(orgId: string, dryRun: boolean): Promise<void> {
  const dogfoodDocs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        eq(documents.category, DOGFOOD_CATEGORY),
        isNull(documents.deletedAt)
      )
    );

  const docIds = dogfoodDocs.map((d) => d.id);
  console.log(`Cleanup: found ${docIds.length} dogfood docs in org ${orgId}`);

  if (docIds.length === 0) return;
  if (dryRun) {
    console.log("(dry-run) Would soft-delete:");
    docIds.forEach((id) => console.log(`    doc ${id}`));
    return;
  }

  // Soft-delete exemplars pointing at these docs.
  const exUpdate = await db
    .update(extractionExemplars)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(extractionExemplars.orgId, orgId),
        sql`${extractionExemplars.documentId} IN (${sql.join(
          docIds.map((id) => sql`${id}`),
          sql`, `
        )})`,
        isNull(extractionExemplars.deletedAt)
      )
    );
  const exRows = (exUpdate as unknown as { rowCount: number }).rowCount ?? 0;

  const docUpdate = await db
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(documents.orgId, orgId),
        eq(documents.category, DOGFOOD_CATEGORY),
        isNull(documents.deletedAt)
      )
    );
  const docRows = (docUpdate as unknown as { rowCount: number }).rowCount ?? 0;

  console.log(`Cleanup done: soft-deleted ${exRows} exemplars, ${docRows} docs`);
  console.log(
    "Note: vendor_tier rows are left as-is (harmless; you can manually demote if needed)."
  );
}

// ---------------------------------------------------------------------------
// Vendor upsert (tax-id first, name fallback)
// ---------------------------------------------------------------------------

async function findVendorByName(orgId: string, name: string) {
  const results = await db
    .select()
    .from(vendorsTable)
    .where(
      and(
        eq(vendorsTable.orgId, orgId),
        eq(vendorsTable.name, name),
        isNull(vendorsTable.deletedAt)
      )
    )
    .limit(1);
  return results[0] ?? null;
}

async function upsertDogfoodVendor(
  orgId: string,
  doc: GroundTruthDoc,
  dryRun: boolean
): Promise<{ id: string } | { synthetic: true; id: string }> {
  const truth = doc.groundTruth;
  const taxId = (truth.vendorTaxId as string | null) ?? null;
  const branchRaw = (truth.vendorBranchNumber as string | null) ?? "00000";
  const branchNumber = branchRaw && branchRaw.length > 0 ? branchRaw : "00000";
  const name =
    (truth.vendorName as string | null) ||
    (truth.vendorNameEn as string | null) ||
    doc.vendorGroup;

  if (dryRun) {
    return { synthetic: true, id: `dry-vendor-${doc.vendorGroup}` };
  }

  if (taxId && taxId.length > 0) {
    const existing = await findVendorByTaxId(orgId, taxId, branchNumber);
    if (existing) return { id: existing.id };
    const created = await createVendor({
      orgId,
      name: name ?? doc.vendorGroup,
      nameTh: (truth.vendorName as string | null) ?? null,
      taxId,
      branchNumber,
      address: (truth.vendorAddress as string | null) ?? null,
      entityType: "company",
    });
    return { id: created.id };
  }

  // No tax ID (e.g. Zeno Marketing HK) — fall back to name match
  const byName = await findVendorByName(orgId, name);
  if (byName) return { id: byName.id };

  const created = await createVendor({
    orgId,
    name,
    entityType: "foreign",
    country: "HK", // best-effort guess for now; user can fix later
  });
  return { id: created.id };
}

// ---------------------------------------------------------------------------
// Synthetic document insert
// ---------------------------------------------------------------------------

async function insertSyntheticDoc(
  orgId: string,
  vendorId: string,
  doc: GroundTruthDoc,
  dryRun: boolean
): Promise<string> {
  if (dryRun) return `dry-doc-${doc.docId}`;

  const truth = doc.groundTruth;
  const docType = (truth.documentType as string) || "invoice";
  const direction = "expense"; // dogfood docs are all vendor invoices
  const issueDate = (truth.issueDate as string | null) || null;
  const dueDate = (truth.dueDate as string | null) || null;

  const [row] = await db
    .insert(documents)
    .values({
      orgId,
      vendorId,
      type: docType as "invoice" | "receipt" | "debit_note" | "credit_note",
      documentNumber: (truth.documentNumber as string | null) ?? null,
      issueDate: issueDate && issueDate.length > 0 ? issueDate : null,
      dueDate: dueDate && dueDate.length > 0 ? dueDate : null,
      subtotal: (truth.subtotal as string | null) ?? null,
      vatAmount: (truth.vatAmount as string | null) ?? null,
      totalAmount: (truth.totalAmount as string | null) ?? null,
      currency: ((truth.currency as string | null) || "THB").slice(0, 3),
      direction,
      category: DOGFOOD_CATEGORY,
      status: "draft",
      detectedLanguage:
        ((truth.detectedLanguage as string | null) || "en").slice(0, 5),
      aiConfidence: "0.95",
      needsReview: false,
      reviewNotes: `dogfood seed from ${doc.samplePath}`,
    })
    .returning({ id: documents.id });
  return row.id;
}

// ---------------------------------------------------------------------------
// Seed exemplars for one doc
// ---------------------------------------------------------------------------

async function seedExemplarsForDoc(
  orgId: string,
  vendorId: string,
  documentId: string,
  doc: GroundTruthDoc,
  dryRun: boolean
): Promise<{ written: number; corrections: number }> {
  const truth = doc.groundTruth;
  const ai = doc.aiExtraction as unknown as Record<string, unknown>;
  const taxId = (truth.vendorTaxId as string | null) ?? null;

  let written = 0;
  let corrections = 0;
  for (const fieldName of LEARNABLE_INVOICE_FIELDS) {
    const aiRaw = ai[fieldName];
    const truthRaw = truth[fieldName];
    const aiValue = toExemplarValue(aiRaw);
    const userValue = toExemplarValue(truthRaw);
    const wasCorrected = !fieldValuesEqual(fieldName, aiValue, userValue);

    if (wasCorrected) corrections++;
    written++;

    if (dryRun) continue;

    await upsertExemplar({
      orgId,
      vendorId,
      fieldName,
      fieldCriticality: getFieldCriticality(fieldName),
      aiValue,
      userValue,
      wasCorrected,
      documentId,
      modelUsed: "dogfood-seed",
      vendorTaxId: taxId,
    });
  }
  return { written, corrections };
}

function toExemplarValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.length === 0 ? null : value;
  }
  if (typeof value === "number") return String(value);
  return null;
}

// ---------------------------------------------------------------------------
// Main seed flow
// ---------------------------------------------------------------------------

async function seed(args: CliArgs): Promise<void> {
  const gtPath = join(args.outDir, "ground-truth.json");
  if (!existsSync(gtPath)) {
    throw new Error(
      `ground-truth.json not found in ${args.outDir}. Run parse-review.ts first.`
    );
  }
  const gt = JSON.parse(readFileSync(gtPath, "utf-8")) as GroundTruthFile;

  // Group by vendor, preserve insertion order (which is per-sample order from summary.json)
  const byVendor = new Map<string, GroundTruthDoc[]>();
  for (const doc of Object.values(gt.docs)) {
    const arr = byVendor.get(doc.vendorGroup) ?? [];
    arr.push(doc);
    byVendor.set(doc.vendorGroup, arr);
  }

  const seedDocs: GroundTruthDoc[] = [];
  for (const [, arr] of byVendor) {
    if (args.seedAll) seedDocs.push(...arr);
    else seedDocs.push(arr[0]);
  }

  console.log(
    `Seeding ${seedDocs.length} doc(s) across ${byVendor.size} vendor group(s)${args.dryRun ? " (dry-run)" : ""}.`
  );

  const summary = {
    vendorsSeeded: 0,
    docsInserted: 0,
    exemplarsWritten: 0,
    corrections: 0,
    promotions: 0,
  };

  for (const doc of seedDocs) {
    console.log("");
    console.log(`  [${doc.docId}] vendor=${doc.vendorGroup}`);

    const vendor = await upsertDogfoodVendor(args.orgId, doc, args.dryRun);
    console.log(`    vendor.id = ${vendor.id}`);

    const docId = await insertSyntheticDoc(
      args.orgId,
      vendor.id,
      doc,
      args.dryRun
    );
    console.log(`    document.id = ${docId}`);
    summary.docsInserted++;

    const { written, corrections } = await seedExemplarsForDoc(
      args.orgId,
      vendor.id,
      docId,
      doc,
      args.dryRun
    );
    summary.exemplarsWritten += written;
    summary.corrections += corrections;
    console.log(
      `    exemplars: ${written} written, ${corrections} flagged as corrections`
    );

    if (!args.dryRun) {
      await promoteVendorTier(args.orgId, vendor.id, 1);
      summary.promotions++;
      console.log(`    vendor_tier → 1`);
    }

    summary.vendorsSeeded++;
  }

  console.log("");
  console.log("Seed summary:");
  console.log(`  vendors touched:     ${summary.vendorsSeeded}`);
  console.log(`  synthetic docs:      ${summary.docsInserted}`);
  console.log(`  exemplars written:   ${summary.exemplarsWritten}`);
  console.log(`  corrections logged:  ${summary.corrections}`);
  console.log(`  tier promotions:     ${summary.promotions}`);
  if (args.dryRun) {
    console.log("");
    console.log("(dry-run — nothing was written)");
  }
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  const args = parseCli(process.argv.slice(2));
  if (args.cleanup) {
    await cleanup(args.orgId, args.dryRun);
    return;
  }
  await seed(args);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
