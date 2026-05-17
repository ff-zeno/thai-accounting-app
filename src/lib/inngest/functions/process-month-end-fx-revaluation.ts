import { inngest } from "../client";
import { processMonthEndFxRevaluationForAllOrgs } from "@/lib/analytics/fx-revaluation";

export const processMonthEndFxRevaluation = inngest.createFunction(
  {
    id: "process-month-end-fx-revaluation",
    retries: 1,
  },
  { cron: "0 4 1 * *" },
  async ({ step }) => {
    return step.run("process-previous-month-end-fx-revaluation", async () => {
      return processMonthEndFxRevaluationForAllOrgs({
        createdByUserId: "system",
      });
    });
  }
);
