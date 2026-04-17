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
import { consensusRecompute } from "@/lib/inngest/functions/consensus-recompute";
import { backfillVendorTaxId } from "@/lib/inngest/functions/backfill-vendor-tax-id";
import { exemplarDecay } from "@/lib/inngest/functions/exemplar-decay";
import { compileVendorPattern } from "@/lib/inngest/functions/compile-vendor-pattern";
import { shadowValidatePattern } from "@/lib/inngest/functions/shadow-validate-pattern";
import { shadowCanary } from "@/lib/inngest/functions/shadow-canary";

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
    consensusRecompute,
    backfillVendorTaxId,
    exemplarDecay,
    compileVendorPattern,
    shadowValidatePattern,
    shadowCanary,
  ],
});
