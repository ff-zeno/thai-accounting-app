import { inngest } from "../client";
import { processPostingOutboxCronBatch } from "@/lib/db/queries/posting-outbox";

export const processPostingOutbox = inngest.createFunction(
  {
    id: "process-posting-outbox",
    concurrency: { limit: 1 },
    retries: 1,
  },
  { cron: "* * * * *" },
  async ({ step }) => {
    return step.run("drain-due-posting-outbox", async () => {
      return processPostingOutboxCronBatch();
    });
  }
);
