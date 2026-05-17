import { inngest } from "../client";
import { processMonthlyDepreciationForAllOrgs } from "@/lib/db/queries/fixed-assets";

export const processMonthlyDepreciation = inngest.createFunction(
  {
    id: "process-monthly-depreciation",
    retries: 1,
  },
  { cron: "0 2 1 * *" },
  async ({ step }) => {
    return step.run("process-previous-month-depreciation", async () => {
      return processMonthlyDepreciationForAllOrgs({
        createdByUserId: "system",
      });
    });
  }
);
