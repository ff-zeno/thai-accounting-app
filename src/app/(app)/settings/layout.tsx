import { getTranslations } from "next-intl/server";
import { SubNav } from "@/components/layout/sub-nav";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Settings uses a grouped sub-nav column rather than a tab strip (DESIGN.md
 * 2026-08-05 — owner decision P3). The column says which settings belong
 * together, which a one-line strip cannot, and it has room to grow.
 *
 * On small screens the column stacks above the content instead of shrinking
 * into an unusable rail.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={t("settings")} />
      <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
        <SubNav
          className="md:sticky md:top-0 md:self-start"
          groups={[
            {
              label: t("settingsGroupOrganization"),
              items: [{ href: "/settings", label: t("organizationSettings") }],
            },
            {
              label: t("settingsGroupAutomation"),
              items: [
                { href: "/settings/ai", label: t("aiSettings") },
                {
                  href: "/settings/reconciliation-rules",
                  label: t("reconciliationRules"),
                },
              ],
            },
          ]}
        />
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
