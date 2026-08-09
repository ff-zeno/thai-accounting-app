import { getTranslations } from "next-intl/server";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/page-header";
import { SettlementImportForm } from "./settlement-import-form";

export default async function SettlementImportPage() {
  const tc = await getTranslations("common");
  const tNav = await getTranslations("nav");

  return (
    <div className="space-y-6">
      <div>
        <BackLink
          href="/income/settlements"
          label={tc("backTo", { target: tNav("settlements") })}
          className="mb-2"
        />
        <PageHeader
          title="Import settlements"
          description="Upload a processor's settlement report and map its columns once — the mapping is remembered for next time."
        />
      </div>
      <SettlementImportForm />
    </div>
  );
}
