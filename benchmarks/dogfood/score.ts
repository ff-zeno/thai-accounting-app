/**
 * Phase 8 Dogfood — accuracy scorer (Tier 0 vs ground truth).
 *
 * Compares per-doc Tier 0 JSONs against the parsed ground-truth.json,
 * normalizes both sides with the same normalizer production uses, and
 * reports per-field / per-doc / per-vendor / overall accuracy (weighted by
 * field criticality).
 *
 * Usage:
 *   pnpm tsx benchmarks/dogfood/score.ts <outDir> [--label tier0] [--source tier0]
 *
 * Arguments:
 *   outDir        Dogfood run directory (must contain ground-truth.json + per-doc JSONs)
 *   --label       Label written into the report. Default: "tier0".
 *   --source      Where to read per-doc extraction JSONs from. Options:
 *                   "tier0"   — <outDir>/<docId>.json (default)
 *                   "tier1"   — <outDir>/tier1/<docId>.json (for compare.ts)
 *
 * Output: <outDir>/<label>-report.json, <outDir>/<label>-report.md
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEARNABLE_INVOICE_FIELDS,
  getFieldCriticality,
  type FieldCriticality,
} from "../../src/lib/ai/field-criticality";
import { normalizeFieldValue } from "../../src/lib/ai/field-normalization";
import type { InvoiceExtraction } from "../../src/lib/ai/schemas/invoice-extraction";
import type { GroundTruthFile } from "./parse-review";

export const CRITICALITY_WEIGHT: Record<FieldCriticality, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export interface FieldResult {
  docId: string;
  vendorGroup: string;
  fieldName: string;
  criticality: FieldCriticality;
  aiValue: string;
  truthValue: string;
  aiNormalized: string;
  truthNormalized: string;
  match: boolean;
  weight: number;
}

export interface DocAggregate {
  docId: string;
  vendorGroup: string;
  fieldsChecked: number;
  fieldsMatched: number;
  weightSum: number;
  weightMatched: number;
  accuracyPct: number;
  weightedPct: number;
}

export interface VendorAggregate {
  vendorGroup: string;
  docs: number;
  fieldsChecked: number;
  fieldsMatched: number;
  weightSum: number;
  weightMatched: number;
  accuracyPct: number;
  weightedPct: number;
}

export interface FieldAggregate {
  fieldName: string;
  criticality: FieldCriticality;
  checked: number;
  matched: number;
  accuracyPct: number;
}

export interface ScoreReport {
  label: string;
  source: string;
  runId: string;
  generatedAt: string;
  docCount: number;
  fieldsChecked: number;
  fieldsMatched: number;
  weightSum: number;
  weightMatched: number;
  overallAccuracyPct: number;
  overallWeightedPct: number;
  perDoc: DocAggregate[];
  perVendor: VendorAggregate[];
  perField: FieldAggregate[];
  rows: FieldResult[];
}

interface Sample {
  id: string;
  vendorGroup: string;
  path: string;
  mimeType: string;
}

interface PerDocFile {
  sample: Sample;
  extraction: InvoiceExtraction;
  modelUsed: string;
  tokenUsage: { input: number; output: number };
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toRawString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function findPerDocFile(outDir: string, source: string, docId: string): string {
  if (source === "tier1") return join(outDir, "tier1", `${docId}.json`);
  return join(outDir, `${docId}.json`);
}

// ---------------------------------------------------------------------------
// Main scorer
// ---------------------------------------------------------------------------

export function score(opts: {
  outDir: string;
  label?: string;
  source?: "tier0" | "tier1";
}): ScoreReport {
  const { outDir } = opts;
  const label = opts.label ?? "tier0";
  const source = opts.source ?? "tier0";

  const gtPath = join(outDir, "ground-truth.json");
  if (!existsSync(gtPath)) {
    throw new Error(`ground-truth.json not found in ${outDir}. Run parse-review.ts first.`);
  }
  const groundTruth = JSON.parse(readFileSync(gtPath, "utf-8")) as GroundTruthFile;

  const rows: FieldResult[] = [];
  const perDoc: DocAggregate[] = [];
  const vendorMap = new Map<string, VendorAggregate>();
  const fieldMap = new Map<string, FieldAggregate>();

  let fieldsChecked = 0;
  let fieldsMatched = 0;
  let weightSum = 0;
  let weightMatched = 0;

  for (const [docId, doc] of Object.entries(groundTruth.docs)) {
    const perDocPath = findPerDocFile(outDir, source, docId);
    if (!existsSync(perDocPath)) {
      console.warn(`  skip ${docId}: extraction file missing at ${perDocPath}`);
      continue;
    }
    const aiFile = JSON.parse(readFileSync(perDocPath, "utf-8")) as PerDocFile;
    const ai = aiFile.extraction as unknown as Record<string, unknown>;
    const truth = doc.groundTruth;

    let docChecked = 0;
    let docMatched = 0;
    let docWeightSum = 0;
    let docWeightMatched = 0;

    for (const fieldName of LEARNABLE_INVOICE_FIELDS) {
      const criticality = getFieldCriticality(fieldName);
      const weight = CRITICALITY_WEIGHT[criticality];

      const aiRaw = toRawString(ai[fieldName]);
      const truthRaw = toRawString(truth[fieldName]);
      const aiNorm = normalizeFieldValue(fieldName, aiRaw);
      const truthNorm = normalizeFieldValue(fieldName, truthRaw);
      const match = aiNorm === truthNorm;

      rows.push({
        docId,
        vendorGroup: doc.vendorGroup,
        fieldName,
        criticality,
        aiValue: aiRaw,
        truthValue: truthRaw,
        aiNormalized: aiNorm,
        truthNormalized: truthNorm,
        match,
        weight,
      });

      docChecked++;
      docWeightSum += weight;
      if (match) {
        docMatched++;
        docWeightMatched += weight;
      }

      // Per-field aggregate
      const fAgg = fieldMap.get(fieldName) ?? {
        fieldName,
        criticality,
        checked: 0,
        matched: 0,
        accuracyPct: 0,
      };
      fAgg.checked++;
      if (match) fAgg.matched++;
      fieldMap.set(fieldName, fAgg);
    }

    const docAgg: DocAggregate = {
      docId,
      vendorGroup: doc.vendorGroup,
      fieldsChecked: docChecked,
      fieldsMatched: docMatched,
      weightSum: docWeightSum,
      weightMatched: docWeightMatched,
      accuracyPct: docChecked > 0 ? (docMatched / docChecked) * 100 : 0,
      weightedPct: docWeightSum > 0 ? (docWeightMatched / docWeightSum) * 100 : 0,
    };
    perDoc.push(docAgg);

    // Per-vendor aggregate
    const vAgg = vendorMap.get(doc.vendorGroup) ?? {
      vendorGroup: doc.vendorGroup,
      docs: 0,
      fieldsChecked: 0,
      fieldsMatched: 0,
      weightSum: 0,
      weightMatched: 0,
      accuracyPct: 0,
      weightedPct: 0,
    };
    vAgg.docs++;
    vAgg.fieldsChecked += docChecked;
    vAgg.fieldsMatched += docMatched;
    vAgg.weightSum += docWeightSum;
    vAgg.weightMatched += docWeightMatched;
    vendorMap.set(doc.vendorGroup, vAgg);

    fieldsChecked += docChecked;
    fieldsMatched += docMatched;
    weightSum += docWeightSum;
    weightMatched += docWeightMatched;
  }

  // Finalize per-field + per-vendor percentages
  const perField = Array.from(fieldMap.values()).map((f) => ({
    ...f,
    accuracyPct: f.checked > 0 ? (f.matched / f.checked) * 100 : 0,
  }));
  perField.sort((a, b) => {
    const w = CRITICALITY_WEIGHT[b.criticality] - CRITICALITY_WEIGHT[a.criticality];
    return w !== 0 ? w : a.fieldName.localeCompare(b.fieldName);
  });

  const perVendor = Array.from(vendorMap.values()).map((v) => ({
    ...v,
    accuracyPct: v.fieldsChecked > 0 ? (v.fieldsMatched / v.fieldsChecked) * 100 : 0,
    weightedPct: v.weightSum > 0 ? (v.weightMatched / v.weightSum) * 100 : 0,
  }));
  perVendor.sort((a, b) => a.vendorGroup.localeCompare(b.vendorGroup));

  return {
    label,
    source,
    runId: groundTruth.runId,
    generatedAt: new Date().toISOString(),
    docCount: perDoc.length,
    fieldsChecked,
    fieldsMatched,
    weightSum,
    weightMatched,
    overallAccuracyPct: fieldsChecked > 0 ? (fieldsMatched / fieldsChecked) * 100 : 0,
    overallWeightedPct: weightSum > 0 ? (weightMatched / weightSum) * 100 : 0,
    perDoc,
    perVendor,
    perField,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

export function renderReportMd(report: ScoreReport): string {
  const lines: string[] = [];
  lines.push(`# Dogfood accuracy report — ${report.label}`);
  lines.push("");
  lines.push(`**Run:** \`${report.runId}\`  `);
  lines.push(`**Source:** ${report.source}  `);
  lines.push(`**Generated:** ${report.generatedAt}  `);
  lines.push(`**Docs scored:** ${report.docCount}  `);
  lines.push("");

  lines.push(`## Overall`);
  lines.push("");
  lines.push(
    `- Raw accuracy: **${report.overallAccuracyPct.toFixed(1)}%** (${report.fieldsMatched}/${report.fieldsChecked} fields)`
  );
  lines.push(
    `- Weighted (high=3, medium=2, low=1): **${report.overallWeightedPct.toFixed(1)}%** (${report.weightMatched}/${report.weightSum} weight)`
  );
  lines.push("");

  lines.push(`## Per-vendor`);
  lines.push("");
  lines.push("| Vendor | Docs | Raw % | Weighted % | Matched/Total |");
  lines.push("|--------|-----:|------:|-----------:|---------------|");
  for (const v of report.perVendor) {
    lines.push(
      `| ${v.vendorGroup} | ${v.docs} | ${v.accuracyPct.toFixed(1)}% | ${v.weightedPct.toFixed(1)}% | ${v.fieldsMatched}/${v.fieldsChecked} |`
    );
  }
  lines.push("");

  lines.push(`## Per-doc`);
  lines.push("");
  lines.push("| Doc | Vendor | Raw % | Weighted % | Matched/Total |");
  lines.push("|-----|--------|------:|-----------:|---------------|");
  for (const d of report.perDoc) {
    lines.push(
      `| ${d.docId} | ${d.vendorGroup} | ${d.accuracyPct.toFixed(1)}% | ${d.weightedPct.toFixed(1)}% | ${d.fieldsMatched}/${d.fieldsChecked} |`
    );
  }
  lines.push("");

  lines.push(`## Per-field`);
  lines.push("");
  lines.push("| Field | Criticality | Accuracy | Matched/Total |");
  lines.push("|-------|-------------|---------:|---------------|");
  for (const f of report.perField) {
    lines.push(
      `| ${f.fieldName} | ${f.criticality} | ${f.accuracyPct.toFixed(1)}% | ${f.matched}/${f.checked} |`
    );
  }
  lines.push("");

  // Mismatches detail
  const mismatches = report.rows.filter((r) => !r.match);
  lines.push(`## Mismatches (${mismatches.length})`);
  lines.push("");
  if (mismatches.length === 0) {
    lines.push("_All fields matched._");
  } else {
    lines.push("| Doc | Field | AI | Truth | AI norm | Truth norm |");
    lines.push("|-----|-------|----|-------|---------|------------|");
    for (const r of mismatches) {
      lines.push(
        `| ${r.docId} | ${r.fieldName} | \`${truncateCell(r.aiValue)}\` | \`${truncateCell(r.truthValue)}\` | \`${truncateCell(r.aiNormalized)}\` | \`${truncateCell(r.truthNormalized)}\` |`
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}

function truncateCell(s: string): string {
  const clean = s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  if (clean.length <= 60) return clean;
  return clean.slice(0, 57) + "...";
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCliArgs(argv: string[]): {
  outDir: string;
  label: string;
  source: "tier0" | "tier1";
} {
  const outDir = argv[0];
  if (!outDir) {
    console.error("Usage: pnpm tsx benchmarks/dogfood/score.ts <outDir> [--label tier0] [--source tier0|tier1]");
    process.exit(1);
  }
  let label = "tier0";
  let source: "tier0" | "tier1" = "tier0";
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--label") label = argv[++i];
    else if (a === "--source") {
      const v = argv[++i];
      if (v !== "tier0" && v !== "tier1") {
        console.error(`--source must be tier0 or tier1, got ${v}`);
        process.exit(1);
      }
      source = v;
    }
  }
  return { outDir, label, source };
}

function main() {
  const { outDir, label, source } = parseCliArgs(process.argv.slice(2));
  const report = score({ outDir, label, source });

  const jsonPath = join(outDir, `${label}-report.json`);
  const mdPath = join(outDir, `${label}-report.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, renderReportMd(report));

  console.log(`Score: ${report.label} (source=${report.source})`);
  console.log(`  Raw:      ${report.overallAccuracyPct.toFixed(1)}% (${report.fieldsMatched}/${report.fieldsChecked})`);
  console.log(`  Weighted: ${report.overallWeightedPct.toFixed(1)}% (${report.weightMatched}/${report.weightSum})`);
  console.log("");
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

const invokedDirectly =
  typeof process !== "undefined" && process.argv[1]?.endsWith("score.ts");
if (invokedDirectly) main();
