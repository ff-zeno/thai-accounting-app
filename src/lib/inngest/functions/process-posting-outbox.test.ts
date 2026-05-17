import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInngestHarness } from "@/tests/inngest-harness";

vi.mock("@/lib/db/queries/posting-outbox", () => ({
  processPostingOutboxCronBatch: vi.fn(),
}));

const { processPostingOutboxCronBatch } = await import(
  "@/lib/db/queries/posting-outbox"
);
const { processPostingOutbox } = await import("./process-posting-outbox");

const harness = createInngestHarness();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processPostingOutbox", () => {
  it("drains due posting outbox rows from the cron handler", async () => {
    vi.mocked(processPostingOutboxCronBatch).mockResolvedValue({
      throughDate: "2026-05-16",
      orgsScanned: 1,
      orgQueueTruncated: false,
      processed: 2,
      posted: 2,
      retrying: 0,
      failed: 0,
      orgResults: [
        {
          orgId: "org_1",
          status: "drained",
          processed: 2,
          posted: 2,
          retrying: 0,
          failed: 0,
        },
      ],
    });

    const { result, step } = await harness.invoke(processPostingOutbox, {
      data: {},
      eventName: "inngest/scheduled.timer",
    });

    expect(processPostingOutboxCronBatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ processed: 2, posted: 2, failed: 0 });
    expect(step.results.get("drain-due-posting-outbox")).toMatchObject({
      orgsScanned: 1,
    });
  });
});
