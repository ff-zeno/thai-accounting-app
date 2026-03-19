import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { formatThb, percentChange } from "./format";
import { cn } from "@/lib/utils";

interface Props {
  currentExpenses: string;
  prevExpenses: string;
  currentIncome: string;
  prevIncome: string;
}

export async function PeriodComparison({
  currentExpenses,
  prevExpenses,
  currentIncome,
  prevIncome,
}: Props) {
  const t = await getTranslations("dashboard");

  const expenseChange = percentChange(currentExpenses, prevExpenses);
  const incomeChange = percentChange(currentIncome, prevIncome);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("periodComparison")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2">
          <ComparisonItem
            label={t("expenses")}
            currentValue={formatThb(currentExpenses)}
            previousValue={formatThb(prevExpenses)}
            change={expenseChange}
            vsLabel={t("vsLastMonth")}
          />
          <ComparisonItem
            label={t("income")}
            currentValue={formatThb(currentIncome)}
            previousValue={formatThb(prevIncome)}
            change={incomeChange}
            vsLabel={t("vsLastMonth")}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonItem({
  label,
  currentValue,
  previousValue,
  change,
  vsLabel,
}: {
  label: string;
  currentValue: string;
  previousValue: string;
  change: { delta: number; direction: "up" | "down" | "flat" } | null;
  vsLabel: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">{currentValue}</span>
        {change && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-sm font-medium",
              change.direction === "up" && "text-red-600 dark:text-red-400",
              change.direction === "down" && "text-green-600 dark:text-green-400",
              change.direction === "flat" && "text-muted-foreground"
            )}
          >
            {change.direction === "up" && <ArrowUp className="size-3.5" />}
            {change.direction === "down" && <ArrowDown className="size-3.5" />}
            {change.direction === "flat" && <Minus className="size-3.5" />}
            {change.delta}%
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {vsLabel}: {previousValue}
      </p>
    </div>
  );
}
