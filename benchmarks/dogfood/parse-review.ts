/**
 * Phase 8 Dogfood — parse filled review.md into typed ground truth.
 *
 * Reads review.md (user-filled) + per-doc Tier 0 JSONs, extracts `field = value`
 * lines from `corrections:<docId>` fenced blocks, validates field names against
 * the invoice Zod schema, merges with AI extraction, and writes ground-truth.json.
 *
 * Usage:
 *   pnpm tsx benchmarks/dogfood/parse-review.ts <outDir>
 *
 * Input:  <outDir>/review.md, <outDir>/<docId>.json, <outDir>/summary.json
 * Output: <outDir>/ground-truth.json
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { invoiceExtractionSchema, type InvoiceExtraction } from "../../src/lib/ai/schemas/invoice-extraction";

export interface Correction {
  field: string;
  rawValue: string;
  normalizedValue: string | null;
  knownField: boolean;
}

export interface GroundTruthDoc {
  docId: string;
  vendorGroup: string;
  samplePath: string;
  approved: boolean;
  needsCorrections: boolean;
  correctedFields: string[];
  aiExtraction: InvoiceExtraction;
  groundTruth: Record<string, unknown>;
  warnings: string[];
}

export interface GroundTruthFile {
  runId: string;
  generatedAt: string;
  docCount: number;
  docsApproved: number;
  docsNeedingCorrections: number;
  totalCorrections: number;
  docs: Record<string, GroundTruthDoc>;
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

interface SummaryFile {
  runId: string;
  generatedAt: string;
  perSample: Array<{ id: string; vendorGroup: string; path: string; ok: boolean }>;
}

// Fields accepted in corrections. Pulled from the Zod schema shape.
const SCHEMA_FIELDS = new Set(Object.keys(invoiceExtractionSchema.shape));

// ---------------------------------------------------------------------------
// Section + block extraction
// ---------------------------------------------------------------------------

interface DocSection {
  docId: string;
  body: string;
  statusLine: string | null;
  correctionsBlock: string | null;
}

export function splitReviewIntoSections(md: string): DocSection[] {
  const sections: DocSection[] = [];
  // Split on "### <docId> — <vendorGroup>" headers. Use a regex that captures
  // up to the next `### ` header or end of file.
  const headerRe = /^###\s+([\w-]+)\s+—\s+.+$/gm;
  const matches: Array<{ docId: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(md)) !== null) {
    matches.push({ docId: m[1], start: m.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const { docId, start } = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1].start : md.length;
    const body = md.slice(start, end);

    // Status line: **Status:** `[ ] approved` `[x] needs corrections`
    const statusMatch = body.match(/\*\*Status:\*\*\s+`(\[.?\])\s+approved`\s+`(\[.?\])\s+needs corrections`/);
    const statusLine = statusMatch ? statusMatch[0] : null;

    // Corrections block: ```corrections:<docId> ... ```
    const blockRe = new RegExp(
      "```corrections:" + escapeRegex(docId) + "\\r?\\n([\\s\\S]*?)```",
      "m"
    );
    const blockMatch = body.match(blockRe);
    const correctionsBlock = blockMatch ? blockMatch[1] : null;

    sections.push({ docId, body, statusLine, correctionsBlock });
  }

  return sections;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Parse a corrections block into field=value pairs
// ---------------------------------------------------------------------------

export function parseCorrectionsBlock(block: string): Correction[] {
  const corrections: Correction[] = [];
  const lines = block.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const field = line.slice(0, eq).trim();
    const rawValue = line.slice(eq + 1).trim();
    if (!field) continue;

    // "-" means the field should be empty (null / "")
    const normalizedValue = rawValue === "-" ? null : rawValue;
    corrections.push({
      field,
      rawValue,
      normalizedValue,
      knownField: SCHEMA_FIELDS.has(field),
    });
  }
  return corrections;
}

// ---------------------------------------------------------------------------
// Status parsing
// ---------------------------------------------------------------------------

export function parseStatusLine(statusLine: string | null): {
  approved: boolean;
  needsCorrections: boolean;
} {
  if (!statusLine) return { approved: false, needsCorrections: false };
  const approvedMatch = statusLine.match(/`\[([x ])\]\s+approved`/i);
  const needsMatch = statusLine.match(/`\[([x ])\]\s+needs corrections`/i);
  const approved = !!approvedMatch && approvedMatch[1].toLowerCase() === "x";
  const needsCorrections = !!needsMatch && needsMatch[1].toLowerCase() === "x";
  return { approved, needsCorrections };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function parseReview(outDir: string): GroundTruthFile {
  if (!existsSync(outDir)) throw new Error(`outDir not found: ${outDir}`);

  const reviewPath = join(outDir, "review.md");
  const summaryPath = join(outDir, "summary.json");
  if (!existsSync(reviewPath)) throw new Error(`review.md missing in ${outDir}`);
  if (!existsSync(summaryPath)) throw new Error(`summary.json missing in ${outDir}`);

  const md = readFileSync(reviewPath, "utf-8");
  const summary = JSON.parse(readFileSync(summaryPath, "utf-8")) as SummaryFile;
  const sections = splitReviewIntoSections(md);

  const docs: Record<string, GroundTruthDoc> = {};
  let docsApproved = 0;
  let docsNeedingCorrections = 0;
  let totalCorrections = 0;

  for (const section of sections) {
    const { docId } = section;
    const perDocPath = join(outDir, `${docId}.json`);
    if (!existsSync(perDocPath)) {
      // Doc listed in review but no JSON — skip
      continue;
    }
    const perDoc = JSON.parse(readFileSync(perDocPath, "utf-8")) as PerDocFile;

    const { approved, needsCorrections } = parseStatusLine(section.statusLine);
    const corrections = section.correctionsBlock
      ? parseCorrectionsBlock(section.correctionsBlock)
      : [];

    const warnings: string[] = [];
    const correctedFields: string[] = [];

    // Start from AI extraction, apply user corrections.
    const groundTruth: Record<string, unknown> = { ...perDoc.extraction };

    for (const c of corrections) {
      if (!c.knownField) {
        warnings.push(`Unknown field "${c.field}" in corrections — ignored`);
        continue;
      }
      // Set to null for "-", otherwise the string value.
      // Don't try to cast numbers here — downstream normalizers handle it.
      groundTruth[c.field] = c.normalizedValue;
      correctedFields.push(c.field);
    }

    if (approved && needsCorrections) {
      warnings.push("Both approved and needs corrections checked — treating as needs corrections");
    }
    if (!approved && !needsCorrections && corrections.length === 0) {
      warnings.push("No status checked and no corrections — doc is unreviewed");
    }
    if (approved && corrections.length > 0) {
      warnings.push("Approved but corrections listed — applying corrections anyway");
    }

    if (approved) docsApproved++;
    if (needsCorrections || corrections.length > 0) docsNeedingCorrections++;
    totalCorrections += correctedFields.length;

    docs[docId] = {
      docId,
      vendorGroup: perDoc.sample.vendorGroup,
      samplePath: perDoc.sample.path,
      approved,
      needsCorrections,
      correctedFields,
      aiExtraction: perDoc.extraction,
      groundTruth,
      warnings,
    };
  }

  return {
    runId: summary.runId,
    generatedAt: new Date().toISOString(),
    docCount: Object.keys(docs).length,
    docsApproved,
    docsNeedingCorrections,
    totalCorrections,
    docs,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: pnpm tsx benchmarks/dogfood/parse-review.ts <outDir>");
    process.exit(1);
  }

  const result = parseReview(outDir);
  const outPath = join(outDir, "ground-truth.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`Parsed ${result.docCount} docs from review.md`);
  console.log(`  Approved:          ${result.docsApproved}`);
  console.log(`  Needs corrections: ${result.docsNeedingCorrections}`);
  console.log(`  Total field edits: ${result.totalCorrections}`);

  const allWarnings = Object.values(result.docs).flatMap((d) =>
    d.warnings.map((w) => `  ${d.docId}: ${w}`)
  );
  if (allWarnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    allWarnings.forEach((w) => console.log(w));
  }
  console.log("");
  console.log(`Wrote ${outPath}`);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("parse-review.ts");
if (invokedDirectly) main();
