import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { searchDocuments, getFilterOptions } from "@/lib/db/queries/documents";
import { getVatRate } from "@/lib/db/queries/tax-config";
import { documentUploadRoute } from "@/lib/routes/documents";
import {
  DocumentTable,
  type DocumentRow,
} from "@/app/(app)/documents/document-table";
import { RouteTabs } from "@/components/layout/route-tabs";
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
    <div className="space-y-6">
      <RouteTabs
        tabs={[
          { href: "/income", label: tNav("invoices") },
          { href: "/income/settlements", label: tNav("settlements") },
        ]}
      />
      <div>
        <PageHeader className="mb-6" title={tNav("income")} />
        <DocumentTable
          direction="income"
          initialDocuments={docsResult.data as DocumentRow[]}
          initialHasMore={docsResult.hasMore}
          initialNextCursor={docsResult.nextCursor}
          filterOptions={filterOptions}
          defaultVatRate={await getVatRate()}
          actions={
            <Button render={<Link href={documentUploadRoute("income")} />}>
              <Upload className="mr-2 size-4" />
              {t("uploadTitle")}
            </Button>
          }
        />
      </div>
    </div>
  );
}
