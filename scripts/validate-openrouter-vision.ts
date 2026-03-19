#!/usr/bin/env tsx
/**
 * Phase 0 / V5 — Validate OpenRouter vision models on Thai document samples.
 *
 * Usage:
 *   npx tsx scripts/validate-openrouter-vision.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod/v4";

// Load .env.local from project root
config({ path: resolve(__dirname, "../.env.local") });

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const IMAGE_PATH = resolve(__dirname, "../_samples/IMG_7722.JPG");

const MODELS_TO_TEST = [
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash",
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
  },
  {
    id: "meta-llama/llama-4-scout",
    name: "Llama 4 Scout",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
];

// Simplified extraction schema for validation (not the full invoice schema)
const extractionSchema = z.object({
  documentType: z
    .enum(["invoice", "receipt", "bank_transfer", "credit_note", "debit_note", "other"])
    .describe("Type of document"),
  payeeName: z.string().optional().describe("Payee / recipient name"),
  payerName: z.string().optional().describe("Payer / sender name"),
  amount: z.string().describe("Total amount as decimal string"),
  currency: z.string().optional().describe("Currency code (THB, USD, etc.)"),
  date: z.string().optional().describe("Date in YYYY-MM-DD format"),
  description: z.string().optional().describe("Brief description of the transaction"),
  transactionId: z.string().optional().describe("Transaction reference or ID"),
  detectedLanguage: z.enum(["th", "en", "mixed"]).describe("Primary language detected"),
  confidence: z.number().min(0).max(1).describe("Confidence score 0-1"),
  notes: z.string().optional().describe("Any issues or ambiguities"),
});

const PROMPT = `You are an expert Thai accounting document extractor. Analyze this document image and extract financial data.

Rules:
- Monetary amounts must be decimal strings (e.g., "485.00")
- Dates must be YYYY-MM-DD format
- Thai Buddhist Era dates: subtract 543 to get CE year (e.g., 2569 BE = 2026 CE)
- Set confidence based on extraction certainty`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("ERROR: OPENROUTER_API_KEY not found in .env.local");
    process.exit(1);
  }

  // Read image and convert to base64 data URL
  const imageBuffer = readFileSync(IMAGE_PATH);
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:image/jpeg;base64,${base64}`;

  console.log(`\n  Image: ${IMAGE_PATH}`);
  console.log(`  Image size: ${(imageBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`  Models to test: ${MODELS_TO_TEST.length}\n`);

  const provider = createOpenRouter({ apiKey });

  const results: Array<{
    modelId: string;
    modelName: string;
    success: boolean;
    timeMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    costEstimate?: number;
    extracted?: z.infer<typeof extractionSchema>;
    error?: string;
  }> = [];

  for (const modelConfig of MODELS_TO_TEST) {
    console.log(`--- Testing: ${modelConfig.name} (${modelConfig.id}) ---`);

    const startTime = Date.now();

    try {
      const model = provider(modelConfig.id);

      const result = await generateObject({
        model,
        schema: extractionSchema,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image", image: dataUrl },
            ],
          },
        ],
        abortSignal: AbortSignal.timeout(30_000),
      });

      const elapsed = Date.now() - startTime;
      const inputTokens = result.usage?.inputTokens ?? 0;
      const outputTokens = result.usage?.outputTokens ?? 0;
      const cost =
        (inputTokens / 1_000_000) * modelConfig.inputCostPer1M +
        (outputTokens / 1_000_000) * modelConfig.outputCostPer1M;

      results.push({
        modelId: modelConfig.id,
        modelName: modelConfig.name,
        success: true,
        timeMs: elapsed,
        inputTokens,
        outputTokens,
        costEstimate: cost,
        extracted: result.object,
      });

      console.log(`  Time: ${(elapsed / 1000).toFixed(1)}s`);
      console.log(`  Tokens: input=${inputTokens}, output=${outputTokens}`);
      console.log(`  Cost: ~$${cost.toFixed(6)}`);
      console.log(`  Extracted:`);
      console.log(`    documentType: ${result.object.documentType}`);
      console.log(`    payee: ${result.object.payeeName ?? "(none)"}`);
      console.log(`    payer: ${result.object.payerName ?? "(none)"}`);
      console.log(`    amount: ${result.object.amount}`);
      console.log(`    currency: ${result.object.currency ?? "(none)"}`);
      console.log(`    date: ${result.object.date ?? "(none)"}`);
      console.log(`    transactionId: ${result.object.transactionId ?? "(none)"}`);
      console.log(`    language: ${result.object.detectedLanguage}`);
      console.log(`    confidence: ${result.object.confidence}`);
      console.log(`    description: ${result.object.description ?? "(none)"}`);
      if (result.object.notes) {
        console.log(`    notes: ${result.object.notes}`);
      }
    } catch (err: unknown) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        modelId: modelConfig.id,
        modelName: modelConfig.name,
        success: false,
        timeMs: elapsed,
        error: message,
      });
      console.log(`  FAILED after ${(elapsed / 1000).toFixed(1)}s`);
      console.log(`  Error: ${message}`);
    }

    console.log();
  }

  // ---------------------------------------------------------------------------
  // Summary table
  // ---------------------------------------------------------------------------
  console.log("=".repeat(90));
  console.log("  COMPARISON SUMMARY");
  console.log("=".repeat(90));
  console.log();

  const col = (s: string, w: number) => s.padEnd(w);
  const colR = (s: string, w: number) => s.padStart(w);

  console.log(
    col("Model", 30) +
      colR("Time", 8) +
      colR("In Tok", 10) +
      colR("Out Tok", 10) +
      colR("Cost", 12) +
      col("  Type", 18) +
      col("Amount", 12) +
      col("Payee", 20)
  );
  console.log("-".repeat(120));

  for (const r of results) {
    if (r.success && r.extracted) {
      console.log(
        col(r.modelName, 30) +
          colR(`${((r.timeMs ?? 0) / 1000).toFixed(1)}s`, 8) +
          colR(String(r.inputTokens ?? 0), 10) +
          colR(String(r.outputTokens ?? 0), 10) +
          colR(`$${(r.costEstimate ?? 0).toFixed(6)}`, 12) +
          col(`  ${r.extracted.documentType}`, 18) +
          col(r.extracted.amount, 12) +
          col(r.extracted.payeeName ?? "-", 20)
      );
    } else {
      console.log(
        col(r.modelName, 30) +
          colR(`${((r.timeMs ?? 0) / 1000).toFixed(1)}s`, 8) +
          col(`  FAILED: ${(r.error ?? "").substring(0, 70)}`, 72)
      );
    }
  }

  console.log();

  // Expected values for accuracy check
  const expected = {
    documentType: "bank_transfer",
    payeeName: "THANTAWAN KHO",
    amount: "485.00",
    date: "2026-01-26",
    currency: "THB",
  };

  console.log("  Expected values (ground truth from document):");
  console.log(`    type: ${expected.documentType}`);
  console.log(`    payee: ${expected.payeeName}`);
  console.log(`    amount: ${expected.amount}`);
  console.log(`    date: ${expected.date}`);
  console.log(`    currency: ${expected.currency}`);
  console.log();

  for (const r of results) {
    if (!r.success || !r.extracted) continue;
    const e = r.extracted;
    const checks = [
      { field: "type", ok: e.documentType === expected.documentType, got: e.documentType },
      {
        field: "payee",
        ok: e.payeeName?.toUpperCase().includes("THANTAWAN") ?? false,
        got: e.payeeName,
      },
      { field: "amount", ok: e.amount === expected.amount, got: e.amount },
      { field: "date", ok: e.date === expected.date, got: e.date },
      { field: "currency", ok: e.currency === expected.currency, got: e.currency },
    ];
    const passed = checks.filter((c) => c.ok).length;
    console.log(`  ${r.modelName}: ${passed}/${checks.length} fields correct`);
    for (const c of checks) {
      const mark = c.ok ? "PASS" : "FAIL";
      console.log(`    [${mark}] ${c.field}: ${c.got}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
