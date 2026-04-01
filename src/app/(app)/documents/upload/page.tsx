import { getTranslations } from "next-intl/server";
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("uploadTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("uploadDescription")}
        </p>
      </div>
      <UploadTabs defaultDirection={defaultDirection} />
    </div>
  );
}
