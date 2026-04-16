/**
 * Extraction Model Comparison
 *
 * Runs multiple OpenRouter-hosted models against the same sample documents
 * (both PDFs and an ID card image) and reports per-call latency, token usage,
 * and USD cost. Dumps each model's raw extracted JSON so you can eyeball
 * quality manually.
 *
 * Cost: this script spends real money on OpenRouter. ~N_models * N_files
 * calls total. Budget roughly $0.01–$0.50 depending on which models you enable.
 *
 * Usage:
 *   pnpm benchmark:extraction
 *
 * Output:
 *   benchmarks/output/<timestamp>/summary.json
 *   benchmarks/output/<timestamp>/<sample>/<model-slug>.json
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { config } from "dotenv";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { invoiceExtractionSchema } from "../src/lib/ai/schemas/invoice-extraction";
import { idCardExtractionSchema } from "../src/lib/ai/schemas/id-card-extraction";
import { rasterizePdf } from "../src/lib/pdf/rasterize";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// 12-model slate — no first-party commercial routes (all 403 on this account),
// no Pixtral Large (too expensive), no Grok (hallucinates Thai tax IDs).
// Asia-weighted: 5x Qwen, plus Llama 4 vision, Mistral, open-weights Gemma.
// All declared as vision-only (input_modalities: image+text) on OpenRouter —
// PDFs are rasterized to PNG pages, no native PDF route exists for any of them.
const MODELS: string[] = [
  "qwen/qwen3-vl-8b-instruct",
  "qwen/qwen3-vl-30b-a3b-instruct",
  "qwen/qwen3-vl-32b-instruct",
  "qwen/qwen3-vl-235b-a22b-instruct",
  "qwen/qwen3.5-9b",
  "meta-llama/llama-4-scout",
  "meta-llama/llama-4-maverick",
  "meta-llama/llama-3.2-11b-vision-instruct",
  "mistralai/mistral-small-3.2-24b-instruct",
  "mistralai/mistral-medium-3.1",
  "google/gemma-4-26b-a4b-it",
  "google/gemma-4-31b-it",
];

type SchemaKey = "invoice" | "idCard";

interface Sample {
  id: string;
  label: string;
  path: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  schema: SchemaKey;
}

const REPO_ROOT = process.cwd();
const SAMPLES: Sample[] = [
  {
    id: "ksher-settlement",
    label: "Ksher merchant settlement invoice (PDF)",
    path: "_sample_file_types/Ksher/W011-01-05436.pdf",
    mimeType: "application/pdf",
    schema: "invoice",
  },
  {
    id: "fedex-invoice",
    label: "Fedex VAT invoice (PDF)",
    path: "_sample_file_types/Paid already with Debit Device/Fedex/TH_VATINV_3552969_04022026_1308.pdf",
    mimeType: "application/pdf",
    schema: "invoice",
  },
  {
    id: "tiktok-invoice",
    label: "TikTok / Lumera invoice (PDF)",
    path: "_sample_file_types/TikTok - just to record real investment/THTT202601830303-LUMERA(THAILAND) CO.,LTD-Invoice.pdf",
    mimeType: "application/pdf",
    schema: "invoice",
  },
  {
    id: "influencer-id-card",
    label: "Thai ID card for influencer payment (JPG)",
    path: "_sample_file_types/need to pay/influencer/656654495_1473099587629485_1032600258607416841_n.jpg",
    mimeType: "image/jpeg",
    schema: "idCard",
  },
];

const INVOICE_PROMPT = `You are an expert Thai accounting document extractor. Extract all financial data from this document.

Key Thai accounting rules:
- Tax IDs are 13 digits (เลขประจำตัวผู้เสียภาษี)
- Branch "00000" = head office (สำนักงานใหญ่)
- Standard VAT rate is 7%
- Thai Buddhist Era dates: subtract 543 to get CE year (e.g., 2567 BE = 2024 CE)

Important:
- All monetary amounts must be decimal strings (e.g., "1234.56"), never floating point
- Dates must be YYYY-MM-DD format
- Set confidence score based on extraction certainty`;

const ID_CARD_PROMPT = `Extract name and citizen ID number from this Thai national ID card.
Convert Buddhist Era dates by subtracting 543. Return dates as YYYY-MM-DD.`;

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

interface ModelPricing {
  promptUsdPerToken: number;
  completionUsdPerToken: number;
}

async function fetchOpenRouterPricing(
  apiKey: string
): Promise<Map<string, ModelPricing>> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch OpenRouter pricing: ${res.status}`);
  }
  const body = (await res.json()) as {
    data: Array<{
      id: string;
      pricing?: { prompt?: string; completion?: string };
    }>;
  };
  const map = new Map<string, ModelPricing>();
  for (const entry of body.data) {
    const prompt = parseFloat(entry.pricing?.prompt ?? "0");
    const completion = parseFloat(entry.pricing?.completion ?? "0");
    map.set(entry.id, {
      promptUsdPerToken: Number.isFinite(prompt) ? prompt : 0,
      completionUsdPerToken: Number.isFinite(completion) ? completion : 0,
    });
  }
  return map;
}

function computeCostUsd(
  pricing: ModelPricing | undefined,
  inputTokens: number,
  outputTokens: number
): number | null {
  if (!pricing) return null;
  return (
    pricing.promptUsdPerToken * inputTokens +
    pricing.completionUsdPerToken * outputTokens
  );
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface RunResult {
  model: string;
  sample: string;
  success: boolean;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  error?: string;
  output?: unknown;
  score?: SampleScore;
}

interface FieldScore {
  field: string;
  expected: string | null;
  actual: string | null;
  status: "correct" | "partial" | "missing" | "hallucinated" | "n/a";
  critical: boolean;
}

interface SampleScore {
  fields: FieldScore[];
  correct: number;
  partial: number;
  missing: number;
  hallucinated: number;
  total: number;
  criticalCorrect: number;
  criticalTotal: number;
  weightedScore: number; // 0..1
}

// ---------------------------------------------------------------------------
// Ground truth + scoring
// ---------------------------------------------------------------------------

interface GroundTruth {
  schema: SchemaKey;
  expected: Record<string, unknown>;
}

function loadGroundTruth(): Map<string, GroundTruth> {
  const raw = readFileSync(
    join(REPO_ROOT, "benchmarks", "ground-truth.json"),
    "utf-8"
  );
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const map = new Map<string, GroundTruth>();
  for (const [sampleId, value] of Object.entries(parsed)) {
    if (sampleId.startsWith("_")) continue;
    const v = value as { schema: SchemaKey; expected: Record<string, unknown> };
    map.set(sampleId, { schema: v.schema, expected: v.expected });
  }
  return map;
}

const CRITICAL_FIELDS: Record<SchemaKey, string[]> = {
  invoice: ["totalAmount", "vendorTaxId", "documentNumber", "issueDate"],
  idCard: ["nameTh", "citizenId", "address"],
};

function normalizeText(s: unknown): string | null {
  if (s === null || s === undefined) return null;
  return String(s)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[,\u0E50-\u0E59]/g, (c) => {
      // Strip commas from numbers; convert Thai digits to Arabic
      if (c === ",") return "";
      return String(c.charCodeAt(0) - 0x0e50);
    });
}

function normalizeNumeric(s: unknown): string | null {
  const t = normalizeText(s);
  if (t === null) return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return t;
  // Compare at 2 decimal precision
  return n.toFixed(2);
}

function isNumericField(field: string): boolean {
  return /Amount|amount|subtotal|total|rate|vat/i.test(field);
}

function scoreField(
  field: string,
  expected: unknown,
  actual: unknown,
  critical: boolean
): FieldScore {
  if (expected === null || expected === undefined || expected === "") {
    return {
      field,
      expected: null,
      actual: actual == null ? null : String(actual),
      status: "n/a",
      critical,
    };
  }

  const numeric = isNumericField(field);
  const expNorm = numeric ? normalizeNumeric(expected) : normalizeText(expected);
  const actNorm = numeric ? normalizeNumeric(actual) : normalizeText(actual);

  if (actNorm === null || actNorm === "") {
    return { field, expected: expNorm, actual: null, status: "missing", critical };
  }
  if (actNorm === expNorm) {
    return { field, expected: expNorm, actual: actNorm, status: "correct", critical };
  }

  // Partial credit: one contains the other (e.g. "Federal Express" in "Federal Express (Thailand) Limited")
  if (
    !numeric &&
    expNorm &&
    (expNorm.toLowerCase().includes(actNorm.toLowerCase()) ||
      actNorm.toLowerCase().includes(expNorm.toLowerCase()))
  ) {
    return { field, expected: expNorm, actual: actNorm, status: "partial", critical };
  }

  return {
    field,
    expected: expNorm,
    actual: actNorm,
    status: "hallucinated",
    critical,
  };
}

function scoreOutput(
  schema: SchemaKey,
  expected: Record<string, unknown>,
  output: unknown
): SampleScore {
  const critical = new Set(CRITICAL_FIELDS[schema]);
  const out = (output ?? {}) as Record<string, unknown>;
  const fields: FieldScore[] = [];

  // Score every expected field
  for (const [key, expectedValue] of Object.entries(expected)) {
    fields.push(
      scoreField(key, expectedValue, out[key], critical.has(key))
    );
  }

  const counted = fields.filter((f) => f.status !== "n/a");
  const correct = counted.filter((f) => f.status === "correct").length;
  const partial = counted.filter((f) => f.status === "partial").length;
  const missing = counted.filter((f) => f.status === "missing").length;
  const hallucinated = counted.filter((f) => f.status === "hallucinated").length;

  const critFields = counted.filter((f) => f.critical);
  const criticalCorrect = critFields.filter(
    (f) => f.status === "correct" || f.status === "partial"
  ).length;

  // Weighted: correct=1.0, partial=0.75, missing=0.25, hallucinated=0.0
  // Critical fields count 3x.
  let num = 0;
  let den = 0;
  for (const f of counted) {
    const w = f.critical ? 3 : 1;
    den += w;
    if (f.status === "correct") num += w * 1.0;
    else if (f.status === "partial") num += w * 0.75;
    else if (f.status === "missing") num += w * 0.25;
  }

  return {
    fields,
    correct,
    partial,
    missing,
    hallucinated,
    total: counted.length,
    criticalCorrect,
    criticalTotal: critFields.length,
    weightedScore: den === 0 ? 0 : num / den,
  };
}

function slugModel(id: string): string {
  return id.replace(/[^a-zA-Z0-9]+/g, "_");
}

interface ImagePage {
  bytes: Uint8Array;
  contentType: string;
}

const PER_CALL_TIMEOUT_MS = 90_000;

async function runOne(
  provider: ReturnType<typeof createOpenRouter>,
  modelId: string,
  sample: Sample,
  pages: ImagePage[],
  pricing: ModelPricing | undefined
): Promise<RunResult> {
  const promptText =
    sample.schema === "invoice" ? INVOICE_PROMPT : ID_CARD_PROMPT;
  const schema =
    sample.schema === "invoice"
      ? invoiceExtractionSchema
      : idCardExtractionSchema;

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mediaType?: string };

  const content: ContentPart[] = [{ type: "text", text: promptText }];
  for (const page of pages) {
    content.push({
      type: "image",
      image: page.bytes,
      mediaType: page.contentType,
    });
  }
  if (pages.length > 1) {
    content.push({
      type: "text",
      text: `These ${pages.length} images are pages of the same document. Extract data from all pages combined.`,
    });
  }

  const start = Date.now();
  try {
    const result = await generateObject({
      model: provider(modelId),
      schema,
      messages: [{ role: "user", content }],
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
    });
    const durationMs = Date.now() - start;

    const inputTokens = result.usage?.inputTokens ?? null;
    const outputTokens = result.usage?.outputTokens ?? null;
    const totalTokens = result.usage?.totalTokens ?? null;
    const costUsd =
      inputTokens !== null && outputTokens !== null
        ? computeCostUsd(pricing, inputTokens, outputTokens)
        : null;

    return {
      model: modelId,
      sample: sample.id,
      success: true,
      durationMs,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd,
      output: result.object,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      model: modelId,
      sample: sample.id,
      success: false,
      durationMs,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      costUsd: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function formatCost(costUsd: number | null): string {
  if (costUsd === null) return "   ?    ";
  if (costUsd === 0) return " free   ";
  return `$${costUsd.toFixed(6)}`;
}

function formatNum(n: number | null, width = 5): string {
  if (n === null) return "?".padStart(width);
  return String(n).padStart(width);
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not set in .env.local");
    process.exit(1);
  }

  console.log("Fetching OpenRouter model pricing...");
  const pricing = await fetchOpenRouterPricing(apiKey);
  console.log(`  Loaded pricing for ${pricing.size} models.\n`);

  // Warn early about any requested model that OpenRouter doesn't currently list.
  for (const m of MODELS) {
    if (!pricing.has(m)) {
      console.warn(
        `  WARN: model "${m}" not found in OpenRouter catalog — will still attempt the call.`
      );
    }
  }

  const provider = createOpenRouter({ apiKey });

  // Load ground-truth reference for scoring.
  const groundTruth = loadGroundTruth();
  console.log(`Loaded ground truth for ${groundTruth.size} samples.\n`);

  // Verify sample files exist.
  const missing = SAMPLES.filter((s) => !existsSync(join(REPO_ROOT, s.path)));
  if (missing.length) {
    console.error("Missing sample files:");
    for (const m of missing) console.error(`  ${m.path}`);
    process.exit(1);
  }

  // Output directory.
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outRoot = join(REPO_ROOT, "benchmarks", "output", runId);
  mkdirSync(outRoot, { recursive: true });
  console.log(`Writing results to benchmarks/output/${runId}/\n`);

  const results: RunResult[] = [];

  for (const sample of SAMPLES) {
    const absPath = join(REPO_ROOT, sample.path);
    const bytes = new Uint8Array(readFileSync(absPath));
    const sampleDir = join(outRoot, sample.id);
    mkdirSync(sampleDir, { recursive: true });

    console.log(`\n=== ${sample.label} ===`);
    console.log(`    ${basename(sample.path)}  (${bytes.byteLength} bytes)`);

    // Materialize the sample as 1+ image pages that every vision model can
    // accept. PDFs are rasterized to PNG pages via pdfjs; images pass through.
    let pages: ImagePage[];
    if (sample.mimeType === "application/pdf") {
      const rasterStart = Date.now();
      const raster = await rasterizePdf(bytes);
      console.log(
        `    rasterized to ${raster.length} page(s) in ${Date.now() - rasterStart}ms (total ${raster.reduce((s, p) => s + p.bytes.byteLength, 0)} bytes)\n`
      );
      pages = raster.map((p) => ({
        bytes: p.bytes,
        contentType: p.contentType,
      }));
    } else {
      console.log(`    (image, no rasterization needed)\n`);
      pages = [{ bytes, contentType: sample.mimeType }];
    }

    // Fan out all models for this sample concurrently. Total time per sample
    // collapses to the slowest-completing model (bounded by PER_CALL_TIMEOUT_MS).
    console.log(`  dispatching ${MODELS.length} models in parallel...`);
    const sampleStart = Date.now();
    const heartbeat = setInterval(() => {
      process.stdout.write(
        `  [${Math.round((Date.now() - sampleStart) / 1000)}s elapsed]\n`
      );
    }, 15_000);

    const settled = await Promise.allSettled(
      MODELS.map((modelId) =>
        runOne(provider, modelId, sample, pages, pricing.get(modelId))
      )
    );
    clearInterval(heartbeat);

    console.log(
      `  all models finished in ${Date.now() - sampleStart}ms\n`
    );

    // Report in the same order we dispatched.
    for (let i = 0; i < MODELS.length; i++) {
      const modelId = MODELS[i];
      const s = settled[i];
      const r: RunResult =
        s.status === "fulfilled"
          ? s.value
          : {
              model: modelId,
              sample: sample.id,
              success: false,
              durationMs: 0,
              inputTokens: null,
              outputTokens: null,
              totalTokens: null,
              costUsd: null,
              error: s.reason instanceof Error ? s.reason.message : String(s.reason),
            };
      results.push(r);

      if (r.success) {
        // Score against ground truth
        const gt = groundTruth.get(sample.id);
        if (gt) {
          r.score = scoreOutput(gt.schema, gt.expected, r.output);
        }

        const scoreStr = r.score
          ? `${(r.score.weightedScore * 100).toFixed(0)}% (${r.score.criticalCorrect}/${r.score.criticalTotal} crit)`
          : "-";
        const line = [
          `${r.durationMs}ms`.padStart(7),
          `in=${formatNum(r.inputTokens, 5)}`,
          `out=${formatNum(r.outputTokens, 4)}`,
          formatCost(r.costUsd),
          scoreStr.padStart(18),
        ].join("  ");
        console.log(`  ${modelId.padEnd(42)} ${line}`);

        writeFileSync(
          join(sampleDir, `${slugModel(modelId)}.json`),
          JSON.stringify(
            {
              model: r.model,
              sample: r.sample,
              durationMs: r.durationMs,
              tokens: {
                input: r.inputTokens,
                output: r.outputTokens,
                total: r.totalTokens,
              },
              costUsd: r.costUsd,
              score: r.score,
              output: r.output,
            },
            null,
            2
          )
        );
      } else {
        console.log(
          `  ${modelId.padEnd(42)} FAILED  ${r.durationMs}ms  ${r.error?.slice(0, 90)}`
        );
        writeFileSync(
          join(sampleDir, `${slugModel(modelId)}.error.txt`),
          String(r.error)
        );
      }
    }
  }

  // ----- Summary per model -----
  console.log("\n\n=== SUMMARY (per model, across all samples) ===\n");
  console.log(
    [
      "model".padEnd(42),
      "pass".padStart(5),
      "avg ms".padStart(8),
      "tot cost".padStart(11),
      "score".padStart(7),
      "crit".padStart(7),
      "halluc".padStart(7),
    ].join("  ")
  );
  console.log("-".repeat(100));

  const byModel = new Map<string, RunResult[]>();
  for (const r of results) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model)!.push(r);
  }

  const summary: Array<Record<string, unknown>> = [];

  const rows: Array<{ model: string; avgScore: number; totCost: number; line: string; summary: Record<string, unknown> }> = [];

  for (const [model, rs] of byModel) {
    const passes = rs.filter((r) => r.success);
    const avgMs = rs.reduce((s, r) => s + r.durationMs, 0) / rs.length;
    const totIn = passes.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
    const totOut = passes.reduce((s, r) => s + (r.outputTokens ?? 0), 0);
    const totCost = passes.reduce((s, r) => s + (r.costUsd ?? 0), 0);

    const scored = passes.filter((r) => r.score);
    const avgScore = scored.length
      ? scored.reduce((s, r) => s + (r.score?.weightedScore ?? 0), 0) / scored.length
      : 0;
    const critCorrect = scored.reduce(
      (s, r) => s + (r.score?.criticalCorrect ?? 0),
      0
    );
    const critTotal = scored.reduce(
      (s, r) => s + (r.score?.criticalTotal ?? 0),
      0
    );
    const halluc = scored.reduce(
      (s, r) => s + (r.score?.hallucinated ?? 0),
      0
    );

    const line = [
      model.padEnd(42),
      String(passes.length).padStart(5),
      `${Math.round(avgMs)}`.padStart(8),
      `$${totCost.toFixed(6)}`.padStart(11),
      `${(avgScore * 100).toFixed(0)}%`.padStart(7),
      `${critCorrect}/${critTotal}`.padStart(7),
      String(halluc).padStart(7),
    ].join("  ");

    rows.push({
      model,
      avgScore,
      totCost,
      line,
      summary: {
        model,
        runs: rs.length,
        passes: passes.length,
        avgDurationMs: Math.round(avgMs),
        totalInputTokens: totIn,
        totalOutputTokens: totOut,
        totalCostUsd: totCost,
        avgWeightedScore: avgScore,
        criticalCorrect: critCorrect,
        criticalTotal: critTotal,
        hallucinatedFields: halluc,
      },
    });
  }

  // Sort by weighted score descending, then by cost ascending
  rows.sort((a, b) => {
    if (Math.abs(a.avgScore - b.avgScore) > 0.01) return b.avgScore - a.avgScore;
    return a.totCost - b.totCost;
  });

  for (const row of rows) {
    console.log(row.line);
    summary.push(row.summary);
  }

  // ----- Per-sample winner -----
  console.log("\n\n=== WINNER PER SAMPLE (highest weighted score, cheapest tiebreaker) ===\n");
  for (const sample of SAMPLES) {
    const sampleResults = results.filter((r) => r.sample === sample.id && r.success && r.score);
    sampleResults.sort((a, b) => {
      const sA = a.score?.weightedScore ?? 0;
      const sB = b.score?.weightedScore ?? 0;
      if (Math.abs(sA - sB) > 0.01) return sB - sA;
      return (a.costUsd ?? 0) - (b.costUsd ?? 0);
    });
    console.log(`${sample.id}:`);
    for (let i = 0; i < Math.min(3, sampleResults.length); i++) {
      const r = sampleResults[i];
      console.log(
        `  ${i + 1}. ${r.model.padEnd(42)} score=${((r.score?.weightedScore ?? 0) * 100).toFixed(0)}%  crit=${r.score?.criticalCorrect}/${r.score?.criticalTotal}  halluc=${r.score?.hallucinated}  cost=$${(r.costUsd ?? 0).toFixed(6)}`
      );
    }
  }

  writeFileSync(
    join(outRoot, "summary.json"),
    JSON.stringify({ runId, results, summary }, null, 2)
  );

  console.log(`\nDone. Full results written to benchmarks/output/${runId}/`);
  console.log(
    "  - summary.json              (all results + aggregated metrics)"
  );
  console.log(
    "  - <sample>/<model>.json     (per-call extracted fields, for manual review)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
