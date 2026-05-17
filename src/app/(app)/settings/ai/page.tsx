import { requireOrgOwnerOrAdmin } from "@/lib/utils/admin-guard";
import { getOrgAiSettings } from "@/lib/db/queries/ai-settings";
import { getBudgetStatus } from "@/lib/ai/cost-tracker";
import { getAiAnalyticsAction } from "./actions";
import { AiSettingsForm } from "./ai-settings-form";
import { AiCostAnalytics } from "./ai-cost-analytics";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  let orgId: string;
  try {
    ({ orgId } = await requireOrgOwnerOrAdmin());
  } catch {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">
          Owner or admin access is required to configure AI settings.
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
