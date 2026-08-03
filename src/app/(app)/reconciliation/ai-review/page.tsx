import { PageHeader } from "@/components/ui/page-header";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getPendingSuggestionsWithDetails } from "@/lib/db/queries/ai-suggestions";
import { AiSuggestionList } from "./ai-suggestion-list";

export default async function AiReviewPage() {
  const orgId = await getVerifiedOrgId();

  if (!orgId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Select an organization to review AI suggestions.
        </p>
      </div>
    );
  }

  const suggestions = await getPendingSuggestionsWithDetails(orgId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Match Suggestions"
        description={`${suggestions.length} pending suggestion${suggestions.length !== 1 ? "s" : ""}`}
      />

      <AiSuggestionList suggestions={suggestions} />
    </div>
  );
}
