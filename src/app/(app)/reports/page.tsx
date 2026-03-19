import { getTranslations } from "next-intl/server";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getDocumentSummary, getVendorNamesForSummary } from "@/lib/db/queries/dashboard";
import { getVendorsByOrg } from "@/lib/db/queries/vendors";
import { SummaryView } from "./summary-view";
import { ExportSection } from "./export-section";

export default async function ReportsPage() {
  const t = await getTranslations("reports");
  const orgId = await getActiveOrgId();

  if (!orgId) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">
          Select an organization to view reports.
        </p>
      </div>
    );
  }

  // Load initial data for both directions (grouped by month by default)
  const [expenseRows, incomeRows, allVendors] = await Promise.all([
    getDocumentSummary(orgId, "expense", "month"),
    getDocumentSummary(orgId, "income", "month"),
    getVendorsByOrg(orgId, undefined, 500, 0),
  ]);

  // Pre-resolve vendor names if there are any vendor-grouped rows
  const vendorIds = [...new Set([...expenseRows, ...incomeRows]
    .map((r) => r.groupKey)
    .filter((id) => id !== "unassigned"))];
  const vendorNames = await getVendorNamesForSummary(orgId, vendorIds);

  const vendorOptions = allVendors.map((v) => ({
    id: v.id,
    name: v.displayAlias ?? v.name,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <SummaryView
        initialExpenseRows={expenseRows}
        initialIncomeRows={incomeRows}
        initialVendorNames={vendorNames}
        vendorOptions={vendorOptions}
      />
      <ExportSection />
    </div>
  );
}
