/**
 * Sandbox runner for compiled extraction patterns.
 *
 * Supports three modes via SANDBOX_MODE env var:
 * - "full": bubblewrap + isolated-vm (Linux production)
 * - "isolate-only": isolated-vm only (macOS dev, default)
 * - "disabled": direct eval (tests only — NEVER in production)
 */

const SANDBOX_MODE =
  (process.env.SANDBOX_MODE as "full" | "isolate-only" | "disabled") ||
  "isolate-only";

const MEMORY_LIMIT_MB = 32;
const TIMEOUT_MS = 100;

/**
 * Run a compiled extraction pattern in a sandboxed environment.
 *
 * @param compiledJs - The compiled JavaScript source of the extract function
 * @param documentText - The document text to extract from
 * @returns The extracted fields as key-value pairs
 * @throws If execution fails, times out, or exceeds memory limits
 */
export async function runCompiledPattern(
  compiledJs: string,
  documentText: string
): Promise<Record<string, string>> {
  if (SANDBOX_MODE === "disabled") {
    return runDirectEval(compiledJs, documentText);
  }

  return runIsolatedVm(compiledJs, documentText);
}

// ---------------------------------------------------------------------------
// isolated-vm execution
// ---------------------------------------------------------------------------

async function runIsolatedVm(
  compiledJs: string,
  documentText: string
): Promise<Record<string, string>> {
  // Dynamic import to avoid breaking builds where isolated-vm isn't available
  const ivm = await import("isolated-vm");

  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB });
  try {
    const context = await isolate.createContext();

    // Inject the document text as a global
    const jail = context.global;
    await jail.set("__documentText__", documentText);

    // Create the script: define the function + call it
    const script = await isolate.compileScript(`
      ${compiledJs}
      JSON.stringify(extract(__documentText__));
    `);

    const resultStr = await script.run(context, {
      timeout: TIMEOUT_MS,
    });

    if (typeof resultStr !== "string") {
      throw new Error("Sandbox: extract function did not return a JSON string");
    }

    const parsed = JSON.parse(resultStr);

    // Validate that result is a flat string record
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Sandbox: extract function must return an object");
    }

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        result[key] = value;
      } else if (value != null) {
        result[key] = String(value);
      }
    }

    return result;
  } finally {
    isolate.dispose();
  }
}

// ---------------------------------------------------------------------------
// Direct eval (tests only)
// ---------------------------------------------------------------------------

function runDirectEval(
  compiledJs: string,
  documentText: string
): Record<string, string> {
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    "text",
    `${compiledJs}\nreturn extract(text);`
  );

  const result = fn(documentText);

  if (typeof result !== "object" || result === null) {
    throw new Error("Direct eval: extract function must return an object");
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string") {
      output[key] = value;
    } else if (value != null) {
      output[key] = String(value);
    }
  }

  return output;
}
