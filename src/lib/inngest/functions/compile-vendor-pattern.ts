import { inngest } from "../client";
import { aggregateExemplarsByVendorKey } from "@/lib/db/queries/extraction-exemplars";
import {
  insertCompiledPattern,
  countAutonomouslyPromoted,
} from "@/lib/db/queries/compiled-patterns";
import { validateExtractorSource } from "@/lib/ai/compiled-patterns/ast-validator";
import { compileExtractor } from "@/lib/ai/compiled-patterns/ts-compiler";
import { buildCompilePrompt } from "@/lib/ai/compiled-patterns/compile-prompt";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/models";
import { createHash } from "crypto";

const MANUAL_REVIEW_THRESHOLD = 100;
const TRAIN_RATIO = 0.8;

/**
 * Phase 8 Phase 3: Compile a vendor pattern from exemplars.
 *
 * Triggered by: learning/vendor-ready-for-compilation
 * (emitted by consensus-recompute when vendor has >=20 Tier 2 exemplars with <5% correction rate)
 *
 * Pipeline:
 * 1. Load exemplars, split 80/20 train/test
 * 2. Call LLM with compile prompt to generate TypeScript source
 * 3. AST validate the generated source
 * 4. Compile TypeScript to JavaScript, compute hashes
 * 5. Store in extraction_compiled_patterns with status='shadow'
 * 6. Emit learning/pattern-compiled for shadow validation
 */
export const compileVendorPattern = inngest.createFunction(
  {
    id: "compile-vendor-pattern",
    retries: 1,
    concurrency: [{ scope: "fn", limit: 2 }],
  },
  { event: "learning/vendor-ready-for-compilation" },
  async ({ event, step }) => {
    const { vendorKey, eligibleOrgIds } = event.data as {
      vendorKey: string;
      eligibleOrgIds: string[];
    };

    // Step 1: Load exemplars and split train/test
    const splitData = await step.run("load-exemplars", async () => {
      const exemplars = await aggregateExemplarsByVendorKey(eligibleOrgIds);
      const vendorExemplars = exemplars.filter(
        (e) => e.vendorTaxId === vendorKey
      );

      if (vendorExemplars.length < 20) {
        return null; // Signal to skip
      }

      // Shuffle deterministically by hashing
      const sorted = [...vendorExemplars].sort((a, b) => {
        const ha = createHash("md5")
          .update(`${a.orgId}:${a.fieldName}:${a.userValue}`)
          .digest("hex");
        const hb = createHash("md5")
          .update(`${b.orgId}:${b.fieldName}:${b.userValue}`)
          .digest("hex");
        return ha.localeCompare(hb);
      });

      const splitIdx = Math.ceil(sorted.length * TRAIN_RATIO);
      return {
        train: sorted.slice(0, splitIdx).map((e) => ({
          fieldName: e.fieldName,
          userValue: e.userValue,
          documentText: "", // Document text not available in aggregation — use field+value for pattern learning
        })),
        test: sorted.slice(splitIdx).map((e) => ({
          fieldName: e.fieldName,
          userValue: e.userValue,
          documentText: "",
        })),
        trainingSetHash: createHash("sha256")
          .update(sorted.map((e) => `${e.orgId}:${e.fieldName}:${e.userValue}`).join("|"))
          .digest("hex"),
      };
    });

    if (!splitData) {
      return { vendorKey, skipped: true, reason: "insufficient exemplars" };
    }

    const { train, test, trainingSetHash } = splitData;

    // Step 2: LLM compile
    const sourceTs = await step.run("llm-compile", async () => {
      const prompt = buildCompilePrompt(train);
      const model = await getModel("extraction");

      const result = await generateText({
        model,
        prompt,
      });

      // Extract the function from markdown code blocks if present
      let source = result.text;
      const codeBlockMatch = source.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        source = codeBlockMatch[1].trim();
      }

      return source;
    });

    // Step 3: AST validate
    const astResult = await step.run("ast-validate", async () => {
      // First compile to JS, then validate the JS AST
      const { compiledJs } = compileExtractor(sourceTs);
      return validateExtractorSource(compiledJs);
    });

    if (!astResult.valid) {
      return {
        vendorKey,
        error: "AST validation failed",
        errors: astResult.errors,
      };
    }

    // Step 4: Compile TypeScript
    const compiled = await step.run("ts-compile", async () => {
      return compileExtractor(sourceTs);
    });

    // Step 5: Store pattern
    const patternId = await step.run("insert-pattern", async () => {
      // Check if first 100 patterns — require manual review
      const autonomousCount = await countAutonomouslyPromoted();
      const requiresReview = autonomousCount < MANUAL_REVIEW_THRESHOLD;

      // Version: count existing patterns for this vendor + 1
      const version = 1; // For v1 implementation, always version 1

      const { id } = await insertCompiledPattern({
        vendorKey,
        scopeKind: "global",
        version,
        sourceTs,
        compiledJs: compiled.compiledJs,
        tsCompilerVersion: compiled.tsVersion,
        astHash: compiled.astHash,
        trainingSetHash,
        requiresManualReview: requiresReview,
      });

      return id;
    });

    // Step 6: Emit for shadow validation
    await step.sendEvent("emit-result", {
      name: "learning/pattern-compiled",
      data: {
        patternId,
        testExemplars: test,
      },
    });

    return { vendorKey, patternId, status: "shadow" };
  }
);
