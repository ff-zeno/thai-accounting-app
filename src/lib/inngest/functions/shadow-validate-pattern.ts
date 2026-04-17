import { inngest } from "../client";
import {
  getPatternById,
  updateShadowResults,
  retirePattern,
} from "@/lib/db/queries/compiled-patterns";
import { validateAgainstTestSet } from "@/lib/ai/compiled-patterns/shadow-validator";
import type { TestExemplar } from "@/lib/ai/compiled-patterns/shadow-validator";

const SHADOW_ACCURACY_THRESHOLD = 0.95;

/**
 * Phase 8 Phase 3: Shadow validation for a newly compiled pattern.
 *
 * Triggered by: learning/pattern-compiled
 *
 * Runs the compiled pattern against held-out test exemplars.
 * If accuracy >=95%, keeps as shadow. Otherwise retires.
 */
export const shadowValidatePattern = inngest.createFunction(
  {
    id: "shadow-validate-pattern",
    retries: 1,
  },
  { event: "learning/pattern-compiled" },
  async ({ event, step }) => {
    const { patternId, testExemplars } = event.data as {
      patternId: string;
      testExemplars: TestExemplar[];
    };

    const pattern = await step.run("load-pattern", async () => {
      return getPatternById(patternId);
    });

    if (!pattern) {
      return { error: "Pattern not found", patternId };
    }

    const validation = await step.run("run-test-set", async () => {
      return validateAgainstTestSet(pattern.compiledJs, testExemplars);
    });

    await step.run("evaluate", async () => {
      await updateShadowResults(patternId, validation.accuracy, validation.total);

      if (validation.accuracy < SHADOW_ACCURACY_THRESHOLD) {
        await retirePattern(
          patternId,
          `Shadow accuracy ${(validation.accuracy * 100).toFixed(1)}% below ${SHADOW_ACCURACY_THRESHOLD * 100}% threshold`
        );
      }
    });

    return {
      patternId,
      accuracy: validation.accuracy,
      agreements: validation.agreements,
      disagreements: validation.disagreements,
      total: validation.total,
      passed: validation.accuracy >= SHADOW_ACCURACY_THRESHOLD,
    };
  }
);
