import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, ArrowRightLeft, Calendar, Landmark } from "lucide-react";

const LINKS = [
  { key: "uploadDocument" as const, href: "/documents/upload", icon: Upload },
  { key: "viewTransactions" as const, href: "/bank-accounts", icon: Landmark },
  { key: "filingCalendar" as const, href: "/tax/calendar", icon: Calendar },
  { key: "reconciliation" as const, href: "/reconciliation", icon: ArrowRightLeft },
];

export async function QuickLinks() {
  const t = await getTranslations("dashboard");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("quickLinks")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {LINKS.map((link) => (
            <Button
              key={link.key}
              variant="outline"
              render={<Link href={link.href} />}
            >
              <link.icon className="mr-2 size-4" />
              {t(link.key)}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
