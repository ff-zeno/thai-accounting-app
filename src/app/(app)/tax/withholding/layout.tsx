import { getTranslations } from "next-intl/server";
import { RouteTabs } from "@/components/layout/route-tabs";

export default async function WithholdingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");

  return (
    <div className="space-y-6">
      <RouteTabs
        tabs={[
          { href: "/tax/withholding", label: t("overview") },
          { href: "/tax/withholding/incoming", label: t("incomingWht") },
          { href: "/tax/withholding/outgoing", label: t("outgoingWht") },
          { href: "/tax/withholding/register", label: t("whtRegister") },
          { href: "/tax/withholding/filings", label: t("whtFilings") },
        ]}
      />
      {children}
    </div>
  );
}
