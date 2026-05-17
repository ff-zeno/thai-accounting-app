import { WithholdingDashboardPage } from "./_components/wht-workflow-pages";
import { getTaxWorkflowExceptions } from "@/lib/db/queries/tax-workflow-exceptions";
import { getActiveOrgId } from "@/lib/utils/org-context";

export default async function WithholdingTaxPage() {
  const orgId = await getActiveOrgId();
  const exceptions = orgId ? await getTaxWorkflowExceptions(orgId) : [];
  return <WithholdingDashboardPage exceptions={exceptions} />;
}
