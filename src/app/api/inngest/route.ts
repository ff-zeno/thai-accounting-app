import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { helloWorld } from "@/lib/inngest/functions/hello-world";
import { processDocument } from "@/lib/inngest/functions/process-document";
import { reconcileDocument } from "@/lib/inngest/functions/reconcile-document";
import { suggestReconciliationRules } from "@/lib/inngest/functions/suggest-rules";
import { aiReconciliationDispatcher } from "@/lib/inngest/functions/ai-reconciliation-dispatcher";
import { aiReconciliationBatch } from "@/lib/inngest/functions/ai-reconciliation-batch";
import { matchImportedTransactions } from "@/lib/inngest/functions/match-imported-transactions";
import { reviewSavedHandler } from "@/lib/inngest/functions/review-saved-handler";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    processDocument,
    reconcileDocument,
    suggestReconciliationRules,
    aiReconciliationDispatcher,
    aiReconciliationBatch,
    matchImportedTransactions,
    reviewSavedHandler,
  ],
});
