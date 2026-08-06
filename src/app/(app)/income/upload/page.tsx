import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { UploadTabs } from "@/app/(app)/documents/upload/upload-tabs";

export default async function IncomeUploadPage() {
  const t = await getTranslations("documents");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        className="mb-6"
        title={t("uploadTitle")}
        description={t("uploadDescription")}
      />
      <UploadTabs defaultDirection="income" />
    </div>
  );
}
