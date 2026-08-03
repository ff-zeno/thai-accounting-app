import { getTranslations } from "next-intl/server";
import { RouteTabs } from "@/components/layout/route-tabs";

export default async function VatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");

  return (
    <div className="space-y-6">
      <RouteTabs
        tabs={[
          { href: "/tax/vat", label: t("overview") },
          { href: "/tax/vat/output", label: t("outputVat") },
          { href: "/tax/vat/input", label: t("inputVat") },
          { href: "/tax/vat/register", label: t("vatRegister") },
          { href: "/tax/vat/filings", label: t("vatFilings") },
          { href: "/tax/vat/forecast", label: t("vatForecast") },
        ]}
      />
      {children}
    </div>
  );
}
