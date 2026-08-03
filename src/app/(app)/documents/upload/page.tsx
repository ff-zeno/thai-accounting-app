import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { UploadTabs } from "./upload-tabs";

export default async function DocumentUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string }>;
}) {
  const t = await getTranslations("documents");
  const { direction } = await searchParams;
  const defaultDirection = direction === "income" ? "income" : "expense";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        className="mb-6"
        title={t("uploadTitle")}
        description={t("uploadDescription")}
      />
      <UploadTabs defaultDirection={defaultDirection} />
    </div>
  );
}
