export interface TrainingExemplar {
  fieldName: string;
  userValue: string | null;
  documentText: string;
}

/**
 * Build the LLM prompt for compiling a set of exemplars into
 * a pure TypeScript extraction function.
 *
 * The function must:
 * - Be named `extract`
 * - Accept a single `text: string` parameter
 * - Return `Record<string, string>`
 * - Use only regex, string operations, number parsing
 * - No imports, no network, no filesystem, no eval
 */
export function buildCompilePrompt(exemplars: TrainingExemplar[]): string {
  const examples = exemplars
    .map((e, i) => {
      const value = e.userValue ?? "(empty)";
      return `Example ${i + 1}:
Field: ${e.fieldName}
Expected value: ${value}
Document text (excerpt):
\`\`\`
${e.documentText.slice(0, 500)}
\`\`\``;
    })
    .join("\n\n");

  return `Write a pure TypeScript function that extracts structured data from Thai accounting documents.

## Requirements

1. The function MUST be named \`extract\` and have this exact signature:
   \`\`\`typescript
   function extract(text: string): Record<string, string>
   \`\`\`

2. The function MUST be pure — no side effects:
   - No imports or require statements
   - No network access (fetch, XMLHttpRequest, etc.)
   - No filesystem access
   - No eval, Function constructor, or dynamic code execution
   - No setTimeout, setInterval, or async operations
   - No global state mutation

3. You may ONLY use:
   - String methods (match, replace, split, trim, indexOf, slice, substring, etc.)
   - RegExp (literal syntax only, no new RegExp with dynamic patterns)
   - Number parsing (parseInt, parseFloat, Number)
   - Math methods
   - JSON.parse (for structured embedded data only)
   - Array methods (map, filter, reduce, find, etc.)
   - Object methods (keys, values, entries)

4. Return an empty object \`{}\` for fields you cannot extract (do not throw).

5. All returned values MUST be strings.

6. Dates should be in YYYY-MM-DD format. Thai Buddhist Era years (พ.ศ.) should be converted to CE by subtracting 543.

7. Monetary amounts should be decimal strings like "1234.56".

## Training Examples

The following examples show the expected field→value mappings for this vendor's documents:

${examples}

## Output

Write ONLY the TypeScript function. No imports, no exports, no module wrapper. Just the function declaration.`;
}
