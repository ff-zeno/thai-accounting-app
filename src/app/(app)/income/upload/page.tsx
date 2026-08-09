import { getTranslations } from "next-intl/server";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/page-header";
import { UploadTabs } from "@/app/(app)/documents/upload/upload-tabs";

export default async function IncomeUploadPage() {
  const t = await getTranslations("documents");
  const tc = await getTranslations("common");
  const tNav = await getTranslations("nav");

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink
        href="/income"
        label={tc("backTo", { target: tNav("income") })}
        className="mb-2"
      />
      <PageHeader
        className="mb-6"
        title={t("uploadTitle")}
        description={t("uploadDescription")}
      />
      <UploadTabs defaultDirection="income" />
    </div>
  );
}
