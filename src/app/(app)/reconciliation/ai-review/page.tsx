import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/reconciliation"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            AI Match Suggestions
          </h1>
          <p className="text-sm text-muted-foreground">
            {suggestions.length} pending suggestion{suggestions.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <AiSuggestionList suggestions={suggestions} />
    </div>
  );
}
