import { z } from "zod/v4";

/**
 * Schema for AI-generated reconciliation match suggestions.
 * Used with structured output when AI processes batches of
 * unmatched transactions + candidate documents.
 */

export const aiMatchRecommendationSchema = z.object({
  transactionId: z.string().describe("ID of the bank transaction being matched"),
  documentId: z.string().describe("ID of the recommended document to match"),
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
      transactionId: z.string(),
      reason: z.string().describe("Why no suitable document was found"),
    })
  ).describe("Transactions that could not be matched to any candidate document"),
});

export type AiMatchRecommendation = z.infer<typeof aiMatchRecommendationSchema>;
export type AiReconciliationBatchResult = z.infer<typeof aiReconciliationBatchResultSchema>;
