import { getTranslations } from "next-intl/server";
import { RouteTabs } from "@/components/layout/route-tabs";
import { PageHeader } from "@/components/ui/page-header";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t("settings")} />
      <RouteTabs
        tabs={[
          { href: "/settings", label: t("organizationSettings") },
          { href: "/settings/ai", label: t("aiSettings") },
          {
            href: "/settings/reconciliation-rules",
            label: t("reconciliationRules"),
          },
          { href: "/settings/cost-centers", label: t("costCenters") },
          { href: "/settings/projects", label: t("projects") },
          { href: "/settings/allocation-rules", label: t("allocationRules") },
        ]}
      />
      {children}
    </div>
  );
}
