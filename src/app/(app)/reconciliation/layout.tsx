import { getTranslations } from "next-intl/server";
import { RouteTabs } from "@/components/layout/route-tabs";

export default async function ReconciliationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");

  return (
    <div className="space-y-6">
      <RouteTabs
        tabs={[
          { href: "/reconciliation", label: t("overview") },
          { href: "/reconciliation/review", label: t("reconciliationReview") },
          { href: "/reconciliation/ai-review", label: t("aiReview") },
          { href: "/reconciliation/insights", label: t("insights") },
        ]}
      />
      {children}
    </div>
  );
}
