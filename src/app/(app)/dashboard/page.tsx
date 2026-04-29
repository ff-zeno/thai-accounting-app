import { getTranslations } from "next-intl/server";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getDashboardMetrics } from "@/lib/db/queries/dashboard";
import { MetricCards } from "./metric-cards";
import { PeriodComparison } from "./period-comparison";
import { FilingStatusTable } from "./filing-status-table";
import { QuickLinks } from "./quick-links";
import { ExceptionReviewList } from "./exception-review-list";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const orgId = await getActiveOrgId();

  if (!orgId) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">{t("noOrgSelected")}</p>
      </div>
    );
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const metrics = await getDashboardMetrics(orgId, year, month);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {/* Row 1: Key metric cards */}
      <MetricCards
        totalExpenses={metrics.totalExpenses}
        totalIncome={metrics.totalIncome}
        netVatPosition={metrics.netVatPosition}
        outstandingFilings={metrics.outstandingFilings}
      />

      {/* Row 2: Period comparison */}
      <PeriodComparison
        currentExpenses={metrics.totalExpenses}
        prevExpenses={metrics.prevMonthExpenses}
        currentIncome={metrics.totalIncome}
        prevIncome={metrics.prevMonthIncome}
      />

      {/* Row 3: Filing status overview */}
      <FilingStatusTable deadlines={metrics.upcomingDeadlines} />

      {/* Row 4: Review queue */}
      <ExceptionReviewList exceptions={metrics.openExceptions} />

      {/* Row 5: Quick links */}
      <QuickLinks />
    </div>
  );
}
