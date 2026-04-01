import { NonRetriableError } from "inngest";
import { inngest } from "../client";
import {
  getUnmatchedTransactionsForAi,
  getUnmatchedDocumentsForAi,
} from "@/lib/db/queries/reconciliation";
import { createAiSuggestion } from "@/lib/db/queries/ai-suggestions";
import {
  getReconciliationMonthCost,
  isWithinReconciliationBudget,
} from "@/lib/ai/reconciliation-cost-tracker";
import { getOrgAiSettings } from "@/lib/db/queries/ai-settings";
import { buildReconciliationPrompt } from "@/lib/ai/prompts/reconciliation-batch";
import { aiReconciliationBatchResultSchema } from "@/lib/ai/schemas/reconciliation-match";
import { estimateCost } from "@/lib/ai/cost-tracker";
import { getModel } from "@/lib/ai/models";
import { generateObject } from "ai";

const MAX_TRANSACTIONS_PER_BATCH = 10;
const MAX_DOCUMENTS_PER_TRANSACTION = 5;
const MAX_BATCHES_PER_RUN = 5;
const MIN_CONFIDENCE_THRESHOLD = 0.3;

interface BatchCandidate {
  transactions: Array<{
    id: string;
    date: string;
    amount: string;
    type: "debit" | "credit";
    description: string | null;
    counterparty: string | null;
    referenceNo: string | null;
    bankAccountId: string;
  }>;
  documents: Array<{
    id: string;
    documentNumber: string | null;
    issueDate: string | null;
    totalAmount: string | null;
    currency: string | null;
    vendorName: string | null;
    netAmountPaid: string | null;
    whtAmountWithheld: string | null;
    vatAmount: string | null;
  }>;
}

/**
 * Per-org AI batch matching processor.
 * Triggered by either cron dispatch or manual trigger.
 * Collects unmatched transactions + candidate documents, sends to LLM,
 * stores results as reviewable suggestions.
 */
export const aiReconciliationBatch = inngest.createFunction(
  {
    id: "ai-reconciliation-batch",
    concurrency: [{ scope: "fn", key: "event.data.orgId", limit: 1 }],
    retries: 2,
  },
  { event: "reconciliation/ai-batch-requested" },
  async ({ event, step }) => {
    const { orgId } = event.data;
    const batchId = crypto.randomUUID();

    // Step 1: Check budget
    const budgetCheck = await step.run("check-budget", async () => {
      const withinBudget = await isWithinReconciliationBudget(orgId);
      if (!withinBudget) {
        throw new NonRetriableError(`Budget exhausted for org ${orgId}`);
      }

      const settings = await getOrgAiSettings(orgId);
      const budgetUsd = settings?.reconciliationBudgetUsd
        ? parseFloat(settings.reconciliationBudgetUsd)
        : 1.0;
      const spent = await getReconciliationMonthCost(orgId);

      return { remainingBudget: budgetUsd - spent, batchId };
    });

    // Step 2: Collect candidates
    const candidates = await step.run("collect-candidates", async () => {
      const txns = await getUnmatchedTransactionsForAi(orgId, 50);
      const docs = await getUnmatchedDocumentsForAi(orgId, 100);

      if (txns.length === 0 || docs.length === 0) {
        return null;
      }

      return { transactions: txns, documents: docs };
    });

    if (!candidates) {
      return { status: "no-candidates", batchId };
    }

    // Step 3: Build batches — group transactions into chunks, find candidate docs per txn
    const batches = await step.run("build-batches", () => {
      const result: BatchCandidate[] = [];
      const txns = candidates.transactions;
      const docs = candidates.documents;

      // Chunk transactions into batches of MAX_TRANSACTIONS_PER_BATCH
      for (
        let i = 0;
        i < txns.length && result.length < MAX_BATCHES_PER_RUN;
        i += MAX_TRANSACTIONS_PER_BATCH
      ) {
        const batchTxns = txns.slice(i, i + MAX_TRANSACTIONS_PER_BATCH);

        // Filter candidate documents per batch based on heuristics
        const candidateDocs = docs.filter((doc) => {
          // At least one transaction in the batch should plausibly match this doc
          return batchTxns.some((txn) => {
            // Direction match: debit = expense, credit = income
            const txnIsExpense = txn.type === "debit";
            const docIsExpense = doc.direction === "expense";
            if (txnIsExpense !== docIsExpense) return false;

            // Amount plausibility: within 50%
            const txnAmount = parseFloat(txn.amount);
            const docAmount = parseFloat(doc.netAmountPaid ?? doc.totalAmount ?? "0");
            if (docAmount === 0) return false;
            const ratio = txnAmount / docAmount;
            if (ratio < 0.5 || ratio > 1.5) return false;

            // Date range: within +/- 30 days
            if (txn.date && doc.issueDate) {
              const txnDate = new Date(txn.date);
              const docDate = new Date(doc.issueDate);
              const daysDiff = Math.abs(txnDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24);
              if (daysDiff > 30) return false;
            }

            return true;
          });
        });

        // Cap candidate docs per batch
        const cappedDocs = candidateDocs.slice(
          0,
          batchTxns.length * MAX_DOCUMENTS_PER_TRANSACTION,
        );

        if (cappedDocs.length > 0) {
          result.push({
            transactions: batchTxns,
            documents: cappedDocs.map((d) => ({
              id: d.id,
              documentNumber: d.documentNumber,
              issueDate: d.issueDate,
              totalAmount: d.totalAmount,
              currency: d.currency,
              vendorName: d.vendorName,
              netAmountPaid: d.netAmountPaid,
              whtAmountWithheld: d.whtAmountWithheld,
              vatAmount: d.vatAmount,
            })),
          });
        }
      }

      return result;
    });

    if (batches.length === 0) {
      return { status: "no-viable-batches", batchId };
    }

    // Steps 4+5: Process each batch (AI call + store results)
    let totalSuggestions = 0;
    let totalCost = 0;
    let remainingBudget = budgetCheck.remainingBudget;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      const batchResult = await step.run(
        `ai-match-batch-${batchIndex}`,
        async () => {
          // Budget check: estimate cost (rough: ~500 tokens per transaction)
          const estimatedInputTokens =
            batch.transactions.length * 500 + batch.documents.length * 300;
          const estimatedOutputTokens = batch.transactions.length * 200;

          const settings = await getOrgAiSettings(orgId);
          const modelId = settings?.reconciliationModel ?? "google/gemini-2.0-flash-001";

          const estimated = estimateCost(
            modelId,
            estimatedInputTokens,
            estimatedOutputTokens,
          );

          if (estimated.totalCost > remainingBudget) {
            return { matches: [] as Array<{ transactionId: string; documentId: string; confidence: number; explanation: string; matchType: string }>, cost: 0, skipped: true, modelId };
          }

          // Build prompt
          const prompt = buildReconciliationPrompt(
            batch.transactions,
            batch.documents,
          );

          // Call AI
          const model = await getModel("reconciliation", orgId);
          const result = await generateObject({
            model,
            schema: aiReconciliationBatchResultSchema,
            system: prompt.system,
            prompt: prompt.user,
          });

          // Calculate actual cost
          const usage = result.usage;
          const actualCost = estimateCost(
            modelId,
            usage?.inputTokens ?? 0,
            usage?.outputTokens ?? 0,
          );

          // Filter matches by confidence and map indices back to UUIDs
          const validMatches = (result.object.matches ?? [])
            .filter((m) => m.confidence > MIN_CONFIDENCE_THRESHOLD)
            .map((m) => ({
              transactionId: prompt.transactionIndexToId.get(m.transactionIndex),
              documentId: prompt.documentIndexToId.get(m.documentIndex),
              confidence: m.confidence,
              explanation: m.explanation,
              matchType: m.matchType,
            }))
            .filter(
              (m): m is typeof m & { transactionId: string; documentId: string } =>
                !!m.transactionId && !!m.documentId,
            );

          return {
            matches: validMatches,
            cost: actualCost.totalCost,
            modelId,
            skipped: false,
          };
        },
      );

      if (batchResult.skipped) continue;

      remainingBudget -= batchResult.cost;
      totalCost += batchResult.cost;

      // Store results
      const stored = await step.run(
        `store-results-${batchIndex}`,
        async () => {
          let count = 0;
          const costPerSuggestion =
            batchResult.matches.length > 0
              ? batchResult.cost / batchResult.matches.length
              : batchResult.cost;

          for (const match of batchResult.matches) {
            if (!match?.transactionId || !match?.documentId) continue;
            const id = await createAiSuggestion({
              orgId,
              transactionId: match.transactionId,
              documentId: match.documentId,
              confidence: match.confidence.toFixed(2),
              explanation: match.explanation,
              aiModelUsed: batchResult.modelId ?? "unknown",
              aiCostUsd: costPerSuggestion.toFixed(6),
              batchId,
            });

            if (id) count++;
          }

          // If no matches but cost was incurred, store a zero-suggestion record for accounting
          if (batchResult.matches.length === 0 && batchResult.cost > 0) {
            // Cost tracking without suggestion — no DB write needed,
            // the cost is captured in the function return value
          }

          return count;
        },
      );

      totalSuggestions += stored;
    }

    return {
      status: "completed",
      batchId,
      batchesProcessed: batches.length,
      suggestionsCreated: totalSuggestions,
      totalCostUsd: totalCost.toFixed(6),
    };
  },
);
