/**
 * Phase 8 Dogfood — Tier 1 re-extraction pass.
 *
 * For each non-seed doc, looks up the vendor (by tax id, with name fallback),
 * fetches the real vendor tier + top exemplars from the DB, builds an
 * ExtractionContext, and re-runs extractDocument. Output goes to
 * <outDir>/tier1/<docId>.json so compare.ts can diff it against Tier 0.
 *
 * Usage:
 *   pnpm tsx benchmarks/dogfood/run-tier1.ts <outDir> --org-id <uuid> [--include-seeds]
 *
 * Flags:
 *   --org-id       REQUIRED. DB uuid of the target organization.
 *   --include-seeds  Also re-extract the first doc of each vendor group (the one
 *                  seed-tier1.ts already used as the seed). Useful for sanity —
 *                  off by default because the seed doc leaks its own answer.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../src/lib/db";
import { vendors as vendorsTable } from "../../src/lib/db/schema";
import {
  extractDocument,
  type ExtractionContext,
  type ExtractionFile,
} from "../../src/lib/ai/extract-document";
import { findVendorByTaxId } from "../../src/lib/db/queries/vendors";
import { getTopExemplars } from "../../src/lib/db/queries/extraction-exemplars";
import { getVendorTier } from "../../src/lib/db/queries/vendor-tier";
import type { GroundTruthFile, GroundTruthDoc } from "./parse-review";

const REPO_ROOT = process.cwd();

interface Sample {
  id: string;
  vendorGroup: string;
  path: string;
  mimeType?: string;
}

interface SummaryFile {
  runId: string;
  perSample: Array<Sample & { ok: boolean }>;
}

interface CliArgs {
  outDir: string;
  orgId: string;
  includeSeeds: boolean;
}

function parseCli(argv: string[]): CliArgs {
  const outDir = argv[0];
  if (!outDir) {
    console.error(
      "Usage: pnpm tsx benchmarks/dogfood/run-tier1.ts <outDir> --org-id <uuid> [--include-seeds]"
    );
    process.exit(1);
  }
  let orgId = "";
  let includeSeeds = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--org-id") orgId = argv[++i];
    else if (a === "--include-seeds") includeSeeds = true;
  }
  if (!orgId) {
    console.error("--org-id <uuid> is required");
    process.exit(1);
  }
  return { outDir, orgId, includeSeeds };
}

function inferMimeType(path: string): string {
  const p = path.toLowerCase();
  if (p.endsWith(".pdf")) return "application/pdf";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  return "application/pdf";
}

// ---------------------------------------------------------------------------
// Vendor lookup — mirrors seed-tier1.ts resolution order
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

async function resolveVendor(
  orgId: string,
  doc: GroundTruthDoc
): Promise<{ id: string; name: string } | null> {
  const truth = doc.groundTruth;
  const taxId = (truth.vendorTaxId as string | null) ?? null;
  const branchRaw = (truth.vendorBranchNumber as string | null) ?? "00000";
  const branchNumber = branchRaw && branchRaw.length > 0 ? branchRaw : "00000";
  const name =
    (truth.vendorName as string | null) ||
    (truth.vendorNameEn as string | null) ||
    doc.vendorGroup;

  if (taxId && taxId.length > 0) {
    const v = await findVendorByTaxId(orgId, taxId, branchNumber);
    if (v) return { id: v.id, name: v.name };
  }
  const byName = await findVendorByName(orgId, name);
  if (byName) return { id: byName.id, name: byName.name };
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY not set in .env.local");
    process.exit(1);
  }

  const args = parseCli(process.argv.slice(2));

  const gtPath = join(args.outDir, "ground-truth.json");
  const summaryPath = join(args.outDir, "summary.json");
  if (!existsSync(gtPath))
    throw new Error(`ground-truth.json missing. Run parse-review.ts first.`);
  if (!existsSync(summaryPath))
    throw new Error(`summary.json missing in ${args.outDir}.`);

  const gt = JSON.parse(readFileSync(gtPath, "utf-8")) as GroundTruthFile;
  const summary = JSON.parse(readFileSync(summaryPath, "utf-8")) as SummaryFile;
  const samplesById = new Map<string, Sample>(
    summary.perSample.filter((s) => s.ok).map((s) => [s.id, s])
  );

  // Determine seeds per vendor group (= first doc, same rule as seed-tier1.ts)
  const seeds = new Set<string>();
  const byVendor = new Map<string, GroundTruthDoc[]>();
  for (const doc of Object.values(gt.docs)) {
    const arr = byVendor.get(doc.vendorGroup) ?? [];
    arr.push(doc);
    byVendor.set(doc.vendorGroup, arr);
  }
  for (const arr of byVendor.values()) {
    if (arr[0]) seeds.add(arr[0].docId);
  }

  const targets: GroundTruthDoc[] = Object.values(gt.docs).filter((d) => {
    if (args.includeSeeds) return true;
    return !seeds.has(d.docId);
  });

  const tier1Dir = join(args.outDir, "tier1");
  mkdirSync(tier1Dir, { recursive: true });

  console.log(`Tier 1 re-extraction: ${targets.length} doc(s)`);
  console.log(`Output: ${tier1Dir}`);
  console.log("");

  const results: Array<{
    docId: string;
    vendorId: string | null;
    tier: number | null;
    exemplarCount: number;
    tokenUsage: { input: number; output: number } | null;
    durationMs: number;
    ok: boolean;
    error?: string;
  }> = [];

  for (const doc of targets) {
    const sample = samplesById.get(doc.docId);
    if (!sample) {
      console.log(`  SKIP ${doc.docId}: no sample entry in summary.json`);
      continue;
    }
    const fullPath = join(REPO_ROOT, sample.path);
    if (!existsSync(fullPath)) {
      console.log(`  SKIP ${doc.docId}: file missing (${sample.path})`);
      continue;
    }

    const vendor = await resolveVendor(args.orgId, doc);
    if (!vendor) {
      console.log(`  SKIP ${doc.docId}: no vendor in DB for ${doc.vendorGroup}`);
      results.push({
        docId: doc.docId,
        vendorId: null,
        tier: null,
        exemplarCount: 0,
        tokenUsage: null,
        durationMs: 0,
        ok: false,
        error: "vendor not found — did seed-tier1.ts run?",
      });
      continue;
    }

    const tierRow = await getVendorTier(args.orgId, vendor.id);
    const exemplars = await getTopExemplars(args.orgId, vendor.id, 3);

    const context: ExtractionContext = {
      tier: 1,
      vendorId: vendor.id,
      exemplarIds: exemplars.map((e) => e.id),
      exemplars: exemplars.map((e) => ({
        fieldName: e.fieldName,
        aiValue: e.aiValue,
        userValue: e.userValue,
      })),
    };

    const bytes = readFileSync(fullPath);
    const mimeType = sample.mimeType ?? inferMimeType(sample.path);
    const files: ExtractionFile[] = [
      { bytes: new Uint8Array(bytes), contentType: mimeType },
    ];

    process.stdout.write(
      `  RUN  ${doc.docId} vendor=${vendor.name} tier=${tierRow?.tier ?? "?"} exemplars=${exemplars.length} ... `
    );
    const start = Date.now();
    try {
      const result = await extractDocument(files, args.orgId, context);
      const durationMs = Date.now() - start;
      console.log(
        `${durationMs}ms tokens=${result.tokenUsage.input}/${result.tokenUsage.output}`
      );

      writeFileSync(
        join(tier1Dir, `${doc.docId}.json`),
        JSON.stringify(
          {
            sample,
            extraction: result.data,
            modelUsed: result.modelUsed,
            tokenUsage: result.tokenUsage,
            durationMs,
            tier1Context: {
              vendorId: vendor.id,
              vendorName: vendor.name,
              tier: tierRow?.tier ?? null,
              exemplarCount: exemplars.length,
            },
          },
          null,
          2
        )
      );

      results.push({
        docId: doc.docId,
        vendorId: vendor.id,
        tier: tierRow?.tier ?? null,
        exemplarCount: exemplars.length,
        tokenUsage: result.tokenUsage,
        durationMs,
        ok: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL: ${msg.slice(0, 140)}`);
      results.push({
        docId: doc.docId,
        vendorId: vendor.id,
        tier: tierRow?.tier ?? null,
        exemplarCount: exemplars.length,
        tokenUsage: null,
        durationMs: Date.now() - start,
        ok: false,
        error: msg,
      });
    }
  }

  const tier1Summary = {
    runId: summary.runId,
    orgId: args.orgId,
    generatedAt: new Date().toISOString(),
    docCount: results.length,
    succeeded: results.filter((r) => r.ok).length,
    totalTokensIn: results.reduce((s, r) => s + (r.tokenUsage?.input ?? 0), 0),
    totalTokensOut: results.reduce((s, r) => s + (r.tokenUsage?.output ?? 0), 0),
    results,
  };
  writeFileSync(
    join(tier1Dir, "tier1-summary.json"),
    JSON.stringify(tier1Summary, null, 2)
  );

  console.log("");
  console.log(
    `Done. ${tier1Summary.succeeded}/${tier1Summary.docCount} succeeded.`
  );
  console.log(
    `Tokens: in=${tier1Summary.totalTokensIn}, out=${tier1Summary.totalTokensOut}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
