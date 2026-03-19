import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Receipt, Wallet, Calculator, FileWarning } from "lucide-react";
import { formatThb } from "./format";

interface Props {
  totalExpenses: string;
  totalIncome: string;
  netVatPosition: string;
  outstandingFilings: number;
}

export async function MetricCards({
  totalExpenses,
  totalIncome,
  netVatPosition,
  outstandingFilings,
}: Props) {
  const t = await getTranslations("dashboard");

  const cards = [
    {
      title: t("totalExpenses"),
      value: formatThb(totalExpenses),
      icon: Receipt,
    },
    {
      title: t("totalIncome"),
      value: formatThb(totalIncome),
      icon: Wallet,
    },
    {
      title: t("netVatPosition"),
      value: formatThb(netVatPosition),
      icon: Calculator,
    },
    {
      title: t("outstandingFilings"),
      value: String(outstandingFilings),
      icon: FileWarning,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} size="sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
