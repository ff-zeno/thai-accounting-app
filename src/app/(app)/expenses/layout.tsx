import { getTranslations } from "next-intl/server";
import { RouteTabs } from "@/components/layout/route-tabs";

export default async function ExpensesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");

  return (
    <div className="space-y-6">
      <RouteTabs
        tabs={[
          { href: "/expenses", label: t("expenses") },
          { href: "/expenses/upload", label: t("upload") },
        ]}
      />
      {children}
    </div>
  );
}
