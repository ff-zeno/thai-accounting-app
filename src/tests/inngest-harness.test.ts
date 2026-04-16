import { describe, it, expect } from "vitest";
import { createInngestHarness, createMockStep, createMockEvent } from "./inngest-harness";

describe("createMockStep", () => {
  it("runs step functions and records results", async () => {
    const step = createMockStep();
    const result = await step.run("my-step", () => 42);
    expect(result).toBe(42);
    expect(step.results.get("my-step")).toBe(42);
  });

  it("runs async step functions", async () => {
    const step = createMockStep();
    const result = await step.run("async-step", async () => {
      return "async-value";
    });
    expect(result).toBe("async-value");
  });

  it("records sent events", async () => {
    const step = createMockStep();
    await step.sendEvent("send-1", { name: "test/event", data: { x: 1 } });
    expect(step.sentEvents).toHaveLength(1);
    expect(step.sentEvents[0].id).toBe("send-1");
  });
});

describe("createMockEvent", () => {
  it("creates event with data and defaults", () => {
    const event = createMockEvent({ documentId: "doc-1", orgId: "org-1" });
    expect(event.data.documentId).toBe("doc-1");
    expect(event.id).toMatch(/^test-/);
    expect(event.name).toBe("test/event");
  });

  it("allows overrides", () => {
    const event = createMockEvent({ x: 1 }, { name: "custom/event" });
    expect(event.name).toBe("custom/event");
  });
});

describe("createInngestHarness", () => {
  it("invokes a handler function directly", async () => {
    const harness = createInngestHarness();

    // Simulate what inngest.createFunction returns — object with .fn property
    const mockFn = {
      fn: async ({ event, step }: { event: { data: { x: number } }; step: { run: typeof createMockStep extends () => infer S ? S["run"] : never } }) => {
        const doubled = await step.run("double", () => event.data.x * 2);
        return doubled;
      },
    };

    const { result, step } = await harness.invoke(mockFn, {
      data: { x: 5 },
    });

    expect(result).toBe(10);
    expect(step.results.get("double")).toBe(10);
  });

  it("provides unique event IDs", async () => {
    const harness = createInngestHarness();
    const mockFn = { fn: async ({ event }: { event: { id: string } }) => event.id };

    const { event: e1 } = await harness.invoke(mockFn, { data: {} });
    const { event: e2 } = await harness.invoke(mockFn, { data: {} });

    expect(e1.id).not.toBe(e2.id);
  });
});
