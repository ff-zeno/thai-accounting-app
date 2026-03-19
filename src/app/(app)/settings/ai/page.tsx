import { getActiveOrgId } from "@/lib/utils/org-context";
import { getOrgAiSettings } from "@/lib/db/queries/ai-settings";
import { getBudgetStatus } from "@/lib/ai/cost-tracker";
import { getAiAnalyticsAction } from "./actions";
import { AiSettingsForm } from "./ai-settings-form";
import { AiCostAnalytics } from "./ai-cost-analytics";

export default async function AiSettingsPage() {
  const orgId = await getActiveOrgId();

  if (!orgId) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">
          Create or select an organization to configure AI settings.
        </p>
      </div>
    );
  }

  const [settings, budgetStatus, analyticsData] = await Promise.all([
    getOrgAiSettings(orgId),
    getBudgetStatus(orgId),
    getAiAnalyticsAction("30d"),
  ]);

  return (
    <div className="space-y-8">
      <AiSettingsForm settings={settings} />
      <AiCostAnalytics budgetStatus={budgetStatus} initialData={analyticsData} />
    </div>
  );
}
