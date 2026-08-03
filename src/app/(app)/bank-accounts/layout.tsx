import { getTranslations } from "next-intl/server";
import { RouteTabs } from "@/components/layout/route-tabs";

export default async function BankAccountsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");

  return (
    <div className="space-y-6">
      <RouteTabs
        tabs={[
          { href: "/bank-accounts", label: t("bankAccounts") },
          { href: "/bank-accounts/upload", label: t("uploadStatement") },
        ]}
      />
      {children}
    </div>
  );
}
