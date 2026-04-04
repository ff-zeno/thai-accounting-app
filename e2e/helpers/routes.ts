/** All static routes in the app (excludes dynamic [id] routes). */
export const ALL_ROUTES = [
  "/dashboard",
  "/bank-accounts",
  "/bank-accounts/upload",
  "/documents/expenses",
  "/documents/income",
  "/documents/upload",
  "/reconciliation",
  "/reconciliation/insights",
  "/reconciliation/review",
  "/reconciliation/ai-review",
  "/tax/wht-certificates",
  "/tax/monthly-filings",
  "/tax/vat",
  "/tax/calendar",
  "/vendors",
  "/reports",
  "/capture",
  "/settings",
  "/settings/ai",
  "/settings/reconciliation-rules",
] as const;

export type AppRoute = (typeof ALL_ROUTES)[number];
