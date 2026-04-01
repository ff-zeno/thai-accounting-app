import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getAllRules, getRulesByTemplateId } from "@/lib/db/queries/reconciliation-rules";
import { templateRegistry } from "@/lib/reconciliation/templates";
import { RulesPageClient } from "./rules-page-client";

export default async function ReconciliationRulesPage() {
  const orgId = await getVerifiedOrgId();

  if (!orgId) {
    return (
      <div className="py-10 text-center">
        <p className="text-muted-foreground">Select an organization to manage rules.</p>
      </div>
    );
  }

  const rules = await getAllRules(orgId);

  // Count rules per template for the template picker
  const templateCounts: Record<string, number> = {};
  for (const tmpl of templateRegistry) {
    const templateRules = await getRulesByTemplateId(orgId, tmpl.id);
    if (templateRules.length > 0) {
      templateCounts[tmpl.id] = templateRules.length;
    }
  }

  const existingTemplateIds = Object.keys(templateCounts);

  return (
    <RulesPageClient
      rules={rules}
      existingTemplateIds={existingTemplateIds}
      existingRuleCounts={templateCounts}
    />
  );
}
