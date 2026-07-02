import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// parseFloat on NUMERIC(14,2) money strings loses precision — use the
// integer-satang helpers in src/lib/utils/money.ts instead.
const noParseFloat = {
  "no-restricted-syntax": [
    "error",
    {
      selector: "CallExpression[callee.name='parseFloat']",
      message:
        "parseFloat is banned in src/lib (money precision). Use toSatang/toSatangOrZero from @/lib/utils/money — or, for genuine non-money floats, add this file to the eslint allowlist with a justification.",
    },
    {
      selector:
        "CallExpression[callee.object.name='Number'][callee.property.name='parseFloat']",
      message:
        "Number.parseFloat is banned in src/lib (money precision). Use toSatang/toSatangOrZero from @/lib/utils/money.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored gstack skills (not our code)
    ".claude/skills/gstack/**",
    // Playwright E2E tests (separate tsconfig)
    "e2e/**",
  ]),
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    // Tests may simulate raw float parsing (e.g. preview formatting, legacy
    // behavior pins) — the guard targets production money paths.
    ignores: ["src/lib/**/*.test.ts", "src/lib/**/*.test.tsx"],
    rules: noParseFloat,
  },
  {
    // parseFloat allowlist — each entry carries its justification. Entries
    // marked DEBT are unmigrated money math: shrink this list, don't grow it.
    files: [
      // The money utility itself (string-parsing internals, tests).
      "src/lib/utils/money.ts",
      // Input validators parse arbitrary user text, then reformat.
      "src/lib/utils/validators.ts",
      // Confidence scores / rule thresholds — ratios, not money.
      "src/lib/reconciliation/match-display.ts",
      "src/lib/reconciliation/rule-engine.ts",
      // SQL-computed percentages — ratios, not money.
      "src/lib/db/queries/reconciliation-metrics.ts",
      // Reputation score — ratio, not money.
      "src/lib/db/queries/org-reputation.ts",
      // USD AI-cost trackers — sub-cent USD floats, not THB ledger money.
      "src/lib/ai/cost-tracker.ts",
      "src/lib/ai/reconciliation-cost-tracker.ts",
      // AI field normalization parses arbitrary model output before
      // canonicalizing to decimal strings.
      "src/lib/ai/field-normalization.ts",
      // Bank parsers operate pre-ledger on raw statement text — separate
      // satang-migration follow-up.
      "src/lib/parsers/**",
      // WHT rate percent display (rate, not money).
      "src/lib/pdf/fifty-tawi.tsx",
      // DEBT: unmigrated money math — migrate to satang, then remove.
      "src/lib/db/queries/dashboard.ts",
      "src/lib/db/queries/wht-certificates.ts",
      "src/lib/export/csv-utils.ts",
      "src/lib/export/flowaccount-export.ts",
      "src/lib/export/peak-export.ts",
      "src/lib/inngest/functions/ai-reconciliation-batch.ts",
      "src/lib/inngest/functions/ai-reconciliation-dispatcher.ts",
      "src/lib/inngest/functions/process-document.ts",
      "src/lib/tax/rd-csv-export.ts",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
