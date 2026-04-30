/**
 * Phase 8 Dogfood — Tier 0 extraction pass
 *
 * Runs the default extraction model (Tier 0 — no exemplars) over a curated
 * set of sample documents, writes raw JSON outputs, and emits a Markdown
 * review file for a human to fill in ground truth.
 *
 * Usage:
 *   pnpm tsx benchmarks/dogfood/run-tier0.ts
 *
 * Output:
 *   benchmarks/dogfood/output/<timestamp>/<doc-id>.json   — raw extraction
 *   benchmarks/dogfood/output/<timestamp>/review.md       — fill-in review doc
 *   benchmarks/dogfood/output/<timestamp>/summary.json    — run metadata
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

import { extractDocument, type ExtractionFile } from "../../src/lib/ai/extract-document";
import type { InvoiceExtraction } from "../../src/lib/ai/schemas/invoice-extraction";
import { rebuildReview } from "./build-review";

const REPO_ROOT = process.cwd();

interface Sample {
  id: string;
  vendorGroup: string;
  path: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  note?: string;
}

const SAMPLES: Sample[] = [
  // Ksher — repeat vendor (first 5 of 22)
  {
    id: "ksher-01",
    vendorGroup: "Ksher",
    path: "_sample_file_types/Ksher/W011-01-05436.pdf",
    mimeType: "application/pdf",
  },
  {
    id: "ksher-02",
    vendorGroup: "Ksher",
    path: "_sample_file_types/Ksher/W017-46-27502.pdf",
    mimeType: "application/pdf",
  },
  {
    id: "ksher-03",
    vendorGroup: "Ksher",
    path: "_sample_file_types/Ksher/W029-52-33710.pdf",
    mimeType: "application/pdf",
  },
  {
    id: "ksher-04",
    vendorGroup: "Ksher",
    path: "_sample_file_types/Ksher/W083-27-22521.pdf",
    mimeType: "application/pdf",
  },
  {
    id: "ksher-05",
    vendorGroup: "Ksher",
    path: "_sample_file_types/Ksher/W298-30-65823.pdf",
    mimeType: "application/pdf",
  },

  // TikTok — repeat vendor (3 of 5)
  {
    id: "tiktok-01",
    vendorGroup: "TikTok",
    path: "_sample_file_types/TikTok - just to record real investment/THTT202601692465-LUMERA(THAILAND) CO.,LTD-Invoice.pdf",
    mimeType: "application/pdf",
  },
  {
    id: "tiktok-02",
    vendorGroup: "TikTok",
    path: "_sample_file_types/TikTok - just to record real investment/THTT202601830303-LUMERA(THAILAND) CO.,LTD-Invoice.pdf",
    mimeType: "application/pdf",
  },
  {
    id: "tiktok-03",
    vendorGroup: "TikTok",
    path: "_sample_file_types/TikTok - just to record real investment/THTT202601885919-LUMERA(THAILAND) CO.,LTD-Invoice.pdf",
    mimeType: "application/pdf",
  },

  // One-offs — variety to stress the Tier 0 pipeline
  {
    id: "fedex",
    vendorGroup: "Fedex",
    path: "_sample_file_types/Paid already with Debit Device/Fedex/TH_VATINV_3552969_04022026_1308.pdf",
    mimeType: "application/pdf",
  },
  {
    id: "photoism",
    vendorGroup: "Photoism",
    path: "_sample_file_types/Photoism - Zeno marketing/Invoice 0150 - March 2026 (1).pdf",
    mimeType: "application/pdf",
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY not set in .env.local");
    process.exit(1);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(REPO_ROOT, "benchmarks", "dogfood", "output", runId);
  mkdirSync(outDir, { recursive: true });

  console.log(`Dogfood run: ${runId}`);
  console.log(`Output: ${outDir}`);
  console.log(`Samples: ${SAMPLES.length}`);
  console.log("");

  const results: Array<{
    sample: Sample;
    extraction: InvoiceExtraction | null;
    error?: string;
    modelUsed?: string;
    tokenUsage?: { input: number; output: number };
    durationMs: number;
  }> = [];

  for (const sample of SAMPLES) {
    const fullPath = join(REPO_ROOT, sample.path);
    if (!existsSync(fullPath)) {
      console.log(`  SKIP  ${sample.id}  (file not found: ${sample.path})`);
      results.push({
        sample,
        extraction: null,
        error: `file not found: ${sample.path}`,
        durationMs: 0,
      });
      continue;
    }

    const bytes = readFileSync(fullPath);
    const files: ExtractionFile[] = [
      { bytes: new Uint8Array(bytes), contentType: sample.mimeType },
    ];

    process.stdout.write(`  RUN   ${sample.id} ... `);
    const start = Date.now();
    try {
      const result = await extractDocument(files);
      const durationMs = Date.now() - start;
      console.log(
        `${durationMs}ms  conf=${result.data.confidence?.toFixed(2) ?? "?"}  model=${result.modelUsed}`,
      );

      writeFileSync(
        join(outDir, `${sample.id}.json`),
        JSON.stringify(
          { sample, extraction: result.data, modelUsed: result.modelUsed, tokenUsage: result.tokenUsage, durationMs },
          null,
          2,
        ),
      );

      results.push({
        sample,
        extraction: result.data,
        modelUsed: result.modelUsed,
        tokenUsage: result.tokenUsage,
        durationMs,
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL (${durationMs}ms): ${msg.slice(0, 140)}`);
      results.push({
        sample,
        extraction: null,
        error: msg,
        durationMs,
      });
    }
  }

  // Summary
  const summary = {
    runId,
    generatedAt: new Date().toISOString(),
    sampleCount: SAMPLES.length,
    succeeded: results.filter((r) => r.extraction).length,
    failed: results.filter((r) => r.error).length,
    totalTokensIn: results.reduce((s, r) => s + (r.tokenUsage?.input ?? 0), 0),
    totalTokensOut: results.reduce((s, r) => s + (r.tokenUsage?.output ?? 0), 0),
    perSample: results.map((r) => ({
      id: r.sample.id,
      vendorGroup: r.sample.vendorGroup,
      path: r.sample.path,
      modelUsed: r.modelUsed,
      tokenUsage: r.tokenUsage,
      durationMs: r.durationMs,
      ok: !!r.extraction,
      error: r.error,
    })),
  };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  const md = rebuildReview(outDir);
  writeFileSync(join(outDir, "review.md"), md);

  console.log("");
  console.log(`Done. ${summary.succeeded}/${summary.sampleCount} succeeded.`);
  console.log(`Tokens: in=${summary.totalTokensIn}, out=${summary.totalTokensOut}`);
  console.log(`Review file: ${join(outDir, "review.md")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
