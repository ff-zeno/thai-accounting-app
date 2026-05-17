import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  BarChart3,
  Boxes,
  Clock3,
  Landmark,
  ReceiptText,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardAnalyticsSnapshot } from "@/lib/db/queries/dashboard";
import { formatThb } from "./format";

interface Props {
  snapshot: DashboardAnalyticsSnapshot;
}

export async function AnalyticsOverview({ snapshot }: Props) {
  const t = await getTranslations("dashboard");
  const cards = [
    {
      title: t("projected30DayCash"),
      value: formatThb(snapshot.projected30DayCash),
      detail: t("payrollOutflow", {
        amount: formatThb(snapshot.scheduledPayrollOutflows),
      }),
      icon: Landmark,
      href: "/analytics/cash-flow",
    },
    {
      title: t("cashRunway"),
      value:
        snapshot.runwayMonths === null
          ? t("analyticsNoBurn")
          : t("analyticsMonths", { value: snapshot.runwayMonths.toFixed(2) }),
      detail: t("asOfDate", { date: snapshot.asOfDate }),
      icon: TrendingUp,
      href: "/analytics/cash-flow",
    },
    {
      title: t("openArAp"),
      value: `${formatThb(snapshot.arTotal)} / ${formatThb(snapshot.apTotal)}`,
      detail: t("netUnpaidAgingTotals"),
      icon: ReceiptText,
      href: "/analytics/ar-aging",
    },
    {
      title: "DSO",
      value: t("analyticsDays", { value: Number(snapshot.dsoDays).toFixed(1) }),
      detail: t("depreciationSignal", {
        amount: formatThb(snapshot.scheduledDepreciationExpense),
      }),
      icon: Clock3,
      href: "/analytics/ar-aging",
    },
  ];
  const drilldowns = [
    {
      label: t("payrollOutflows"),
      href: "/payroll",
      icon: WalletCards,
    },
    {
      label: t("depreciation"),
      href: "/fixed-assets/reports/roll-forward",
      icon: Boxes,
    },
    {
      label: t("concentration"),
      href: "/analytics/concentration",
      icon: ReceiptText,
    },
    {
      label: t("profitability"),
      href: "/analytics/profitability",
      icon: BarChart3,
    },
  ];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {t("analyticsOverview")}
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            aria-label={card.title}
            className="block rounded-lg outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card size="sm" className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <card.icon className="size-4 shrink-0 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{card.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {drilldowns.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium whitespace-nowrap outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
