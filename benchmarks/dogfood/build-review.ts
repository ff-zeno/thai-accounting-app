/**
 * Rebuilds review.md from per-doc JSON outputs + summary.json in an output dir.
 *
 * Usage:
 *   pnpm tsx benchmarks/dogfood/build-review.ts <output-dir>
 *
 * Output format is aligned key:value blocks per doc with a corrections
 * edit zone at the bottom of each block.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { InvoiceExtraction } from "../../src/lib/ai/schemas/invoice-extraction";

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

interface Summary {
  runId: string;
  generatedAt: string;
  sampleCount: number;
  succeeded: number;
  failed: number;
  totalTokensIn: number;
  totalTokensOut: number;
  perSample: Array<{
    id: string;
    vendorGroup: string;
    path: string;
    modelUsed?: string;
    tokenUsage?: { input: number; output: number };
    durationMs: number;
    ok: boolean;
    error?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Field ordering and label width
// ---------------------------------------------------------------------------

const FIELDS: Array<keyof InvoiceExtraction> = [
  "documentType",
  "documentNumber",
  "issueDate",
  "dueDate",
  "vendorName",
  "vendorNameEn",
  "vendorTaxId",
  "vendorBranchNumber",
  "vendorAddress",
  "buyerName",
  "buyerTaxId",
  "subtotal",
  "vatRate",
  "vatAmount",
  "totalAmount",
  "currency",
  "detectedLanguage",
];

const LABEL_WIDTH = Math.max(...FIELDS.map((f) => f.length));

function padLabel(label: string): string {
  return label + " ".repeat(LABEL_WIDTH - label.length);
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  return String(value).replace(/\n/g, " ");
}

// ---------------------------------------------------------------------------
// Per-doc block
// ---------------------------------------------------------------------------

function renderDocBlock(doc: PerDocFile): string[] {
  const lines: string[] = [];
  lines.push(`### ${doc.sample.id} — ${doc.sample.vendorGroup}`);
  lines.push("");
  lines.push(`**File:** \`${doc.sample.path}\`  `);
  lines.push(
    `**Model:** ${doc.modelUsed} · ${doc.durationMs}ms · tokens ${doc.tokenUsage.input}/${doc.tokenUsage.output} · conf ${doc.extraction.confidence?.toFixed(2) ?? "?"}`,
  );
  lines.push("");

  lines.push("```");
  for (const field of FIELDS) {
    lines.push(`${padLabel(field)}  :  ${renderValue(doc.extraction[field])}`);
  }
  lines.push("```");
  lines.push("");

  // Line items
  if (doc.extraction.lineItems && doc.extraction.lineItems.length > 0) {
    lines.push(`**Line items (${doc.extraction.lineItems.length}):**`);
    lines.push("");
    lines.push("```");
    doc.extraction.lineItems.forEach((li, idx) => {
      const qty = li.quantity ?? "?";
      const unit = li.unitPrice ?? "?";
      const amt = li.amount ?? "?";
      const vat = li.vatAmount ?? "-";
      lines.push(`[${idx + 1}] ${li.description}`);
      lines.push(`    qty ${qty} · unit ${unit} · amount ${amt} · vat ${vat}`);
    });
    lines.push("```");
    lines.push("");
  }

  // AI notes
  if (doc.extraction.notes) {
    lines.push(`**AI notes:** ${doc.extraction.notes}`);
    lines.push("");
  }

  // Corrections edit zone
  lines.push(`**Status:** \`[ ] approved\`  \`[ ] needs corrections\``);
  lines.push("");
  lines.push(`**Corrections** — list only the fields that are wrong. Use \`-\` to mean "should be empty". Leave empty if everything is fine.`);
  lines.push("");
  lines.push("```corrections:" + doc.sample.id);
  lines.push("# field = corrected_value");
  lines.push("# example: totalAmount = 5350.00");
  lines.push("");
  lines.push("```");
  lines.push("");
  lines.push(`---`);
  lines.push("");

  return lines;
}

// ---------------------------------------------------------------------------
// Main rebuild
// ---------------------------------------------------------------------------

export function rebuildReview(outDir: string): string {
  if (!existsSync(outDir)) throw new Error(`outDir not found: ${outDir}`);
  const summaryPath = join(outDir, "summary.json");
  if (!existsSync(summaryPath))
    throw new Error(`summary.json missing in ${outDir}`);
  const summary = JSON.parse(readFileSync(summaryPath, "utf-8")) as Summary;

  const lines: string[] = [];
  lines.push(`# Phase 8 Dogfood — Tier 0 Extraction Review`);
  lines.push("");
  lines.push(`**Run:** \`${summary.runId}\`  `);
  lines.push(`**Generated:** ${summary.generatedAt}  `);
  lines.push(
    `**Samples:** ${summary.succeeded}/${summary.sampleCount} succeeded  `,
  );
  lines.push(
    `**Tokens:** in=${summary.totalTokensIn}, out=${summary.totalTokensOut}  `,
  );
  lines.push("");

  lines.push(`## How to use this file`);
  lines.push("");
  lines.push(`For each doc below:`);
  lines.push("");
  lines.push(`1. Scan the \`field : value\` block. If AI got everything right, check the **approved** box.`);
  lines.push(`2. Otherwise, write the corrected values in the **Corrections** block. One per line, \`field = value\`.`);
  lines.push(`   - Use \`-\` to mean "this field should be empty".`);
  lines.push(`   - Skip fields that are already correct — only list changes.`);
  lines.push(`3. Save the file. Hand it back and I'll parse it into typed ground truth + seed Tier 1 exemplars.`);
  lines.push("");
  lines.push(`Line items are shown as reference only — scoring focuses on top-level fields for now.`);
  lines.push("");
  lines.push(`---`);
  lines.push("");

  lines.push(`## Per-doc summary (token cost + timing)`);
  lines.push("");
  lines.push("```");
  lines.push(
    `doc id      vendor      tokens (in/out)   duration    conf    status`,
  );
  for (const s of summary.perSample) {
    const docs = readdirSync(outDir).filter(
      (f) => f === `${s.id}.json`,
    );
    let conf = "?";
    if (docs.length > 0) {
      const doc = JSON.parse(readFileSync(join(outDir, docs[0]), "utf-8")) as PerDocFile;
      conf = doc.extraction.confidence?.toFixed(2) ?? "?";
    }
    const tok = s.tokenUsage
      ? `${s.tokenUsage.input}/${s.tokenUsage.output}`
      : "-/-";
    const status = s.ok ? "ok" : `FAIL: ${(s.error ?? "").slice(0, 40)}`;
    lines.push(
      `${s.id.padEnd(11)} ${s.vendorGroup.padEnd(11)} ${tok.padEnd(17)} ${(s.durationMs + "ms").padEnd(11)} ${conf.padEnd(7)} ${status}`,
    );
  }
  lines.push("```");
  lines.push("");
  lines.push(`---`);
  lines.push("");

  // Emit per-doc blocks in the order summary.perSample lists them
  for (const s of summary.perSample) {
    const perDocPath = join(outDir, `${s.id}.json`);
    if (!existsSync(perDocPath)) {
      lines.push(`### ${s.id} — ${s.vendorGroup}`);
      lines.push("");
      lines.push(`> **No extraction file found.** ${s.error ?? ""}`);
      lines.push("");
      lines.push("---");
      lines.push("");
      continue;
    }
    const doc = JSON.parse(readFileSync(perDocPath, "utf-8")) as PerDocFile;
    lines.push(...renderDocBlock(doc));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: pnpm tsx benchmarks/dogfood/build-review.ts <output-dir>");
    process.exit(1);
  }
  const md = rebuildReview(outDir);
  const outPath = join(outDir, "review.md");
  writeFileSync(outPath, md);
  console.log(`Wrote ${outPath} (${md.length} chars)`);
}

// Run when invoked directly
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("build-review.ts");
if (invokedDirectly) main();
