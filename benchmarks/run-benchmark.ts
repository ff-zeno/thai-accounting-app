/**
 * Model Benchmarking Script
 *
 * Tests extraction models against fixture images with known expected results.
 *
 * Usage:
 *   pnpm benchmark
 *
 * Setup:
 *   1. Place invoice images in benchmarks/fixtures/ (e.g., invoice-001.jpg)
 *   2. Place expected JSON in benchmarks/expected/ (e.g., invoice-001.json)
 *   3. Set OPENROUTER_API_KEY in .env.local
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { config } from "dotenv";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { invoiceExtractionSchema, type InvoiceExtraction } from "../src/lib/ai/schemas/invoice-extraction";

config({ path: ".env.local" });

const MODELS = [
  "anthropic/claude-sonnet-4",
  "google/gemini-2.0-flash-001",
  "openai/gpt-4o",
];

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const EXPECTED_DIR = join(import.meta.dirname, "expected");

interface BenchmarkResult {
  model: string;
  fixture: string;
  durationMs: number;
  accuracy: number;
  fieldMatches: Record<string, boolean>;
  error?: string;
}

function scoreExtraction(
  actual: InvoiceExtraction,
  expected: Partial<InvoiceExtraction>
): { accuracy: number; fieldMatches: Record<string, boolean> } {
  const fields: (keyof InvoiceExtraction)[] = [
    "documentType",
    "documentNumber",
    "issueDate",
    "vendorTaxId",
    "totalAmount",
    "vatAmount",
    "subtotal",
    "currency",
    "detectedLanguage",
  ];

  const matches: Record<string, boolean> = {};
  let matched = 0;
  let total = 0;

  for (const field of fields) {
    if (expected[field] === undefined) continue;
    total++;
    const same =
      String(actual[field]).trim().toLowerCase() ===
      String(expected[field]).trim().toLowerCase();
    matches[field] = same;
    if (same) matched++;
  }

  return {
    accuracy: total > 0 ? matched / total : 0,
    fieldMatches: matches,
  };
}

async function runBenchmark() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY not set in .env.local");
    process.exit(1);
  }

  const provider = createOpenRouter({ apiKey });

  // Find fixture files
  if (!existsSync(FIXTURES_DIR)) {
    console.error("No benchmarks/fixtures/ directory found");
    process.exit(1);
  }

  const fixtureFiles = readdirSync(FIXTURES_DIR).filter((f) =>
    [".jpg", ".jpeg", ".png"].includes(extname(f).toLowerCase())
  );

  if (fixtureFiles.length === 0) {
    console.log("No fixture images found in benchmarks/fixtures/");
    console.log("Add invoice images (.jpg, .png) and matching .json files in benchmarks/expected/");
    process.exit(0);
  }

  console.log(`Found ${fixtureFiles.length} fixture(s), testing ${MODELS.length} model(s)\n`);

  const results: BenchmarkResult[] = [];

  for (const fixture of fixtureFiles) {
    const name = basename(fixture, extname(fixture));
    const imagePath = join(FIXTURES_DIR, fixture);
    const expectedPath = join(EXPECTED_DIR, `${name}.json`);

    const imageBuffer = readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString("base64");
    const mimeType = fixture.endsWith(".png") ? "image/png" : "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    const expected: Partial<InvoiceExtraction> | null = existsSync(expectedPath)
      ? JSON.parse(readFileSync(expectedPath, "utf-8"))
      : null;

    console.log(`\n--- ${fixture} ---`);

    for (const modelId of MODELS) {
      process.stdout.write(`  ${modelId}... `);

      const start = Date.now();
      try {
        const result = await generateObject({
          model: provider(modelId),
          schema: invoiceExtractionSchema,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all financial data from this Thai invoice/receipt image. All amounts as decimal strings. Dates as YYYY-MM-DD.",
                },
                { type: "image", image: dataUrl },
              ],
            },
          ],
        });

        const durationMs = Date.now() - start;
        const { accuracy, fieldMatches } = expected
          ? scoreExtraction(result.object, expected)
          : { accuracy: -1, fieldMatches: {} };

        results.push({
          model: modelId,
          fixture,
          durationMs,
          accuracy,
          fieldMatches,
        });

        const accuracyStr =
          accuracy >= 0 ? `${Math.round(accuracy * 100)}%` : "n/a (no expected)";
        console.log(
          `${durationMs}ms | accuracy: ${accuracyStr} | tokens: ${result.usage?.totalTokens ?? "?"}`
        );
      } catch (err) {
        const durationMs = Date.now() - start;
        results.push({
          model: modelId,
          fixture,
          durationMs,
          accuracy: 0,
          fieldMatches: {},
          error: String(err),
        });
        console.log(`FAILED (${durationMs}ms): ${String(err).slice(0, 100)}`);
      }
    }
  }

  // Summary
  console.log("\n\n=== SUMMARY ===\n");
  const byModel = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model)!.push(r);
  }

  for (const [model, modelResults] of byModel) {
    const withAccuracy = modelResults.filter((r) => r.accuracy >= 0);
    const avgAccuracy =
      withAccuracy.length > 0
        ? withAccuracy.reduce((s, r) => s + r.accuracy, 0) / withAccuracy.length
        : -1;
    const avgDuration =
      modelResults.reduce((s, r) => s + r.durationMs, 0) / modelResults.length;
    const errors = modelResults.filter((r) => r.error).length;

    console.log(`${model}:`);
    console.log(`  Avg accuracy: ${avgAccuracy >= 0 ? Math.round(avgAccuracy * 100) + "%" : "n/a"}`);
    console.log(`  Avg latency:  ${Math.round(avgDuration)}ms`);
    console.log(`  Errors:       ${errors}/${modelResults.length}`);
    console.log();
  }
}

runBenchmark().catch(console.error);
