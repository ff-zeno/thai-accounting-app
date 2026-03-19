import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { helloWorld } from "@/lib/inngest/functions/hello-world";
import { processDocument } from "@/lib/inngest/functions/process-document";
import { reconcileDocument } from "@/lib/inngest/functions/reconcile-document";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld, processDocument, reconcileDocument],
});
