import ts from "typescript";
import { createHash } from "crypto";

export interface CompileResult {
  compiledJs: string;
  astHash: string;
  tsVersion: string;
}

/**
 * Compile a TypeScript source string to JavaScript with strict settings.
 * Returns the compiled JS, a SHA-256 hash of the output (for integrity checking),
 * and the TypeScript compiler version used.
 *
 * Throws on compilation errors.
 */
export function compileExtractor(sourceTs: string): CompileResult {
  const result = ts.transpileModule(sourceTs, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      noEmitOnError: true,
      removeComments: true,
      esModuleInterop: false,
      declaration: false,
      sourceMap: false,
    },
    reportDiagnostics: true,
  });

  // Check for diagnostics (errors)
  if (result.diagnostics && result.diagnostics.length > 0) {
    const errorMessages = result.diagnostics
      .filter(
        (d) => d.category === ts.DiagnosticCategory.Error
      )
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));

    if (errorMessages.length > 0) {
      throw new Error(
        `TypeScript compilation failed:\n${errorMessages.join("\n")}`
      );
    }
  }

  const compiledJs = result.outputText;
  const astHash = createHash("sha256").update(compiledJs).digest("hex");

  return {
    compiledJs,
    astHash,
    tsVersion: ts.version,
  };
}
