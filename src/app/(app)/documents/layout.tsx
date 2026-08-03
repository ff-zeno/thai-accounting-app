import { getTranslations } from "next-intl/server";
import { RouteTabs } from "@/components/layout/route-tabs";

export default async function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");

  return (
    <div className="space-y-6">
      <RouteTabs
        tabs={[
          { href: "/documents/expenses", label: t("expenses") },
          { href: "/documents/income", label: t("income") },
          { href: "/documents/upload", label: t("upload") },
        ]}
      />
      {children}
    </div>
  );
}
