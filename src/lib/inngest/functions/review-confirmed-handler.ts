import { inngest } from "../client";
import { promoteCandidatesForConfirmedSession } from "@/lib/db/queries/extraction-learning-candidates";

export const reviewConfirmedHandler = inngest.createFunction(
  {
    id: "review-confirmed-handler",
    retries: 2,
  },
  { event: "learning/review-confirmed" },
  async ({ event, step }) => {
    const { orgId, correctionSessionId } = event.data as {
      orgId: string;
      documentId: string;
      vendorId: string | null;
      extractionLogId: string;
      correctionSessionId: string;
      confirmed: boolean;
    };

    const promoted = await step.run("promote-confirmed-candidates", async () =>
      promoteCandidatesForConfirmedSession({ orgId, correctionSessionId })
    );

    return {
      processed: true,
      correctionSessionId,
      activeCandidates: promoted.active,
      shadowCandidates: promoted.shadow,
    };
  }
);
