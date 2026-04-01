import { z } from "zod/v4";

/**
 * Index-based schema for AI reconciliation match suggestions.
 * Uses T{n}/D{n} indices instead of UUIDs so the LLM prompt stays compact
 * and the model never needs to reproduce long UUID strings.
 */

export const aiMatchRecommendationSchema = z.object({
  transactionIndex: z.int().min(1).describe(
    "Index of the bank transaction (the number N from T{N} in the prompt)"
  ),
  documentIndex: z.int().min(1).describe(
    "Index of the matched document (the number N from D{N} in the prompt)"
  ),
  confidence: z.number().min(0).max(1).describe("Confidence score 0.0-1.0"),
  explanation: z.string().describe(
    "Brief explanation of why this match is recommended. " +
    "Reference specific fields: amount, date, vendor name, description patterns."
  ),
  matchType: z.enum(["strong", "likely", "possible"]).describe(
    "strong: high confidence, auto-approvable. " +
    "likely: good match, human review recommended. " +
    "possible: weak signals, needs manual verification."
  ),
});

export const aiReconciliationBatchResultSchema = z.object({
  matches: z.array(aiMatchRecommendationSchema).describe(
    "Recommended matches from the batch. Only include matches with confidence > 0.3."
  ),
  unmatchable: z.array(
    z.object({
      transactionIndex: z.int().min(1).describe(
        "Index of the unmatched transaction (the number N from T{N})"
      ),
      reason: z.string().describe("Why no suitable document was found"),
    })
  ).describe("Transactions that could not be matched to any candidate document"),
});

export type AiMatchRecommendation = z.infer<typeof aiMatchRecommendationSchema>;
export type AiReconciliationBatchResult = z.infer<typeof aiReconciliationBatchResultSchema>;
