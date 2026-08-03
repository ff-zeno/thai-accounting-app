import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { searchDocuments, getFilterOptions } from "@/lib/db/queries/documents";
import { getVatRate } from "@/lib/db/queries/tax-config";
import { DocumentTable, type DocumentRow } from "../document-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Upload } from "lucide-react";

export default async function IncomePage() {
  const t = await getTranslations("documents");
  const tNav = await getTranslations("nav");
  const orgId = await getActiveOrgId();

  const [docsResult, filterOptions] = orgId
    ? await Promise.all([
        searchDocuments({ orgId, direction: "income" }),
        getFilterOptions(orgId, "income"),
      ])
    : [{ data: [], hasMore: false, nextCursor: null }, { categories: [], vendors: [] }];

  return (
    <div>
      <PageHeader className="mb-6" title={tNav("income")}>
        <Button render={<Link href="/documents/upload?direction=income" />}>
          <Upload className="mr-2 size-4" />
          {t("uploadTitle")}
        </Button>
      </PageHeader>
      <DocumentTable
        direction="income"
        initialDocuments={docsResult.data as DocumentRow[]}
        initialHasMore={docsResult.hasMore}
        initialNextCursor={docsResult.nextCursor}
        filterOptions={filterOptions}
        defaultVatRate={await getVatRate()}
      />
    </div>
  );
}
