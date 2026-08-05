/**
 * All static routes in the app (excludes dynamic [id] routes and the
 * redirect stubs kept for old deep links).
 *
 * The list mirrors the five-entry nav: Home, Bank, Documents, Tax, Vendors,
 * plus Settings. Surfaces removed on 2026-08-03 are recorded in
 * docs/deferred-features.md.
 */
export const ALL_ROUTES = [
  "/dashboard",
  "/bank-accounts",
  "/bank-accounts/upload",
  "/reconciliation",
  "/reconciliation/review",
  "/reconciliation/ai-review",
  "/reconciliation/insights",
  "/documents/expenses",
  "/documents/income",
  "/documents/upload",
  "/capture",
  "/tax",
  "/tax/vat",
  "/tax/vat/input",
  "/tax/vat/output",
  "/tax/vat/register",
  "/tax/vat/filings",
  "/tax/vat/forecast",
  "/tax/withholding",
  "/tax/withholding/incoming",
  "/tax/withholding/outgoing",
  "/tax/withholding/register",
  "/tax/withholding/filings",
  "/tax/calendar",
  "/tax/reports",
  "/vendors",
  "/settings",
  "/settings/ai",
  "/settings/reconciliation-rules",
] as const;

export type AppRoute = (typeof ALL_ROUTES)[number];
