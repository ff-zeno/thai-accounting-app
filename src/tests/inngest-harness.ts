/**
 * Inngest test harness — runs Inngest function handlers in-process without
 * the Inngest server. The mock `step` object executes each step.run()
 * synchronously (awaited in sequence) and returns results directly.
 *
 * Usage:
 *   import { createInngestHarness } from "@/tests/inngest-harness";
 *
 *   const harness = createInngestHarness();
 *   const result = await harness.invoke(processDocument, {
 *     data: { documentId: "...", orgId: "..." },
 *   });
 *
 * The handler receives a mock { event, step } context that behaves like
 * the real Inngest SDK but runs everything in-process.
 */

type StepRunFn = <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
type StepSendEventFn = (id: string, events: unknown) => Promise<void>;

interface MockStep {
  run: StepRunFn;
  sendEvent: StepSendEventFn;
  /** Record of step results keyed by step ID, for assertions. */
  results: Map<string, unknown>;
  /** Events sent via step.sendEvent(), for assertions. */
  sentEvents: Array<{ id: string; events: unknown }>;
}

interface MockEvent<TData = Record<string, unknown>> {
  id: string;
  name: string;
  data: TData;
  ts: number;
}

interface InvokeOptions<TData = Record<string, unknown>> {
  data: TData;
  eventName?: string;
  eventId?: string;
}

/**
 * An Inngest function created via `inngest.createFunction(...)`.
 * We need to extract the handler from it. The Inngest SDK stores
 * the handler as a private property, so we use a type-safe accessor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InngestFunction = any;

function createMockStep(): MockStep {
  const results = new Map<string, unknown>();
  const sentEvents: MockStep["sentEvents"] = [];

  const run: StepRunFn = async (id, fn) => {
    const result = await fn();
    results.set(id, result);
    return result;
  };

  const sendEvent: StepSendEventFn = async (id, events) => {
    sentEvents.push({ id, events });
  };

  return { run, sendEvent, results, sentEvents };
}

export function createInngestHarness() {
  return {
    /**
     * Invoke an Inngest function handler directly.
     *
     * The function must have been created with `inngest.createFunction()`.
     * The Inngest SDK v3 exposes the handler via `.fn()` or stores it
     * internally. We access it using the SDK's public test helpers or
     * by calling the function object directly.
     */
    async invoke<TData extends Record<string, unknown>, TResult = unknown>(
      fn: InngestFunction,
      options: InvokeOptions<TData>
    ): Promise<{
      result: TResult;
      step: MockStep;
      event: MockEvent<TData>;
    }> {
      const step = createMockStep();
      const event: MockEvent<TData> = {
        id: options.eventId ?? `test-${crypto.randomUUID()}`,
        name: options.eventName ?? "test/invoke",
        data: options.data,
        ts: Date.now(),
      };

      // Inngest SDK v3 InngestFunction stores the handler in ["fn"].
      // The createFunction return has a callable internal handler.
      // We access it via the private `_handler` or `fn` property.
      let handler: (ctx: { event: MockEvent<TData>; step: MockStep }) => Promise<TResult>;

      if (typeof fn === "function") {
        handler = fn;
      } else if (typeof fn?.fn === "function") {
        handler = fn.fn;
      } else if (typeof fn?._handler === "function") {
        handler = fn._handler;
      } else {
        // Inngest SDK v3.x: The createFunction return is an object with
        // a private handler. Try accessing via Symbol or iterating.
        // Fallback: ask user to pass handler directly.
        throw new Error(
          "Could not extract handler from Inngest function. " +
          "Pass the handler function directly, or use inngest.createFunction() v3+."
        );
      }

      const result = await handler({ event, step });
      return { result: result as TResult, step, event };
    },
  };
}

/**
 * Helper to build a mock event for direct use in step-level testing
 * without invoking the full pipeline.
 */
export function createMockEvent<TData extends Record<string, unknown>>(
  data: TData,
  overrides?: Partial<MockEvent<TData>>
): MockEvent<TData> {
  return {
    id: `test-${crypto.randomUUID()}`,
    name: "test/event",
    data,
    ts: Date.now(),
    ...overrides,
  };
}

export { createMockStep };
export type { MockStep, MockEvent };
