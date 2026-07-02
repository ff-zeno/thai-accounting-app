import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  FileText,
  Landmark,
  Receipt,
  Upload,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getOwnerHomeMetrics,
  type ReviewException,
} from "@/lib/db/queries/dashboard";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { formatThb } from "./format";

function bangkokYearMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function exceptionHref(item: ReviewException): string {
  switch (item.entityType) {
    case "document":
      return `/documents/${item.entityId}/review`;
    case "transaction":
      return "/reconciliation/review";
    default:
      return "/dashboard";
  }
}

function severityVariant(
  severity: string
): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "p0" || severity === "p1") return "destructive";
  if (severity === "p2") return "default";
  return "secondary";
}

function daysLabel(daysRemaining: number, overdueLabel: string): string {
  if (daysRemaining < 0) {
    return `${Math.abs(daysRemaining)}d ${overdueLabel.toLowerCase()}`;
  }
  return `${daysRemaining}d`;
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const orgId = await getActiveOrgId();

  if (!orgId) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">{t("noOrgSelected")}</p>
      </div>
    );
  }

  const { year, month } = bangkokYearMonth();
  const metrics = await getOwnerHomeMetrics(orgId, year, month);
  const openDeadlines = metrics.upcomingDeadlines.filter(
    (item) => item.status !== "filed"
  );
  const nextDeadline = openDeadlines[0] ?? null;
  const overdueDeadlines = metrics.upcomingDeadlines.filter(
    (item) => item.daysRemaining < 0 && item.status !== "filed"
  ).length;

  const monthlyChecklist = [
    {
      label: t("checklistBankStatements"),
      href: "/bank-accounts/upload",
      icon: Landmark,
      detail: t("checklistUpload"),
    },
    {
      label: t("checklistDocuments"),
      href: "/documents/upload",
      icon: FileText,
      detail: t("checklistUpload"),
    },
    {
      label: t("checklistReconciliation"),
      href: "/reconciliation",
      icon: ArrowRightLeft,
      detail:
        metrics.openExceptions.length > 0
          ? t("checklistNeedsReview", { count: metrics.openExceptions.length })
          : t("checklistReady"),
    },
    {
      label: t("checklistVatReview"),
      href: "/tax/vat",
      icon: Receipt,
      detail: formatThb(metrics.netVatPosition),
    },
    {
      label: t("checklistWhtReview"),
      href: "/tax/withholding",
      icon: Receipt,
      detail: t("checklistOpenFilings", {
        count: metrics.outstandingFilings,
      }),
    },
  ];

  const quickActions = [
    { label: t("bankUploadAction"), href: "/bank-accounts/upload", icon: Upload },
    { label: t("documentsUploadAction"), href: "/documents/upload", icon: Upload },
    { label: t("reconciliationAction"), href: "/reconciliation", icon: ArrowRightLeft },
    { label: t("taxAction"), href: "/tax/vat", icon: Receipt },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.href}
              variant="outline"
              size="xs"
              render={<Link href={action.href} />}
            >
              <action.icon className="size-4" />
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              {t("needsAttention")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.openExceptions.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-success" />
                {t("noAttentionItems")}
              </div>
            ) : (
              <div className="divide-y">
                {metrics.openExceptions.map((item) => (
                  <Link
                    key={item.id}
                    href={exceptionHref(item)}
                    className="block py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={severityVariant(item.severity)}>
                            {item.severity.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {item.exceptionType.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="text-sm font-medium leading-5">
                          {item.summary}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("thisMonthsTax")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-md border p-3">
                <div className="text-sm text-muted-foreground">
                  {t("netVatPosition")}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {formatThb(metrics.netVatPosition)}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-sm text-muted-foreground">
                  {t("outstandingFilings")}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {metrics.outstandingFilings}
                </div>
              </div>
            </div>

            {nextDeadline ? (
              <div className="flex items-start gap-3 rounded-md bg-muted/50 p-3">
                <Clock className="mt-0.5 size-4 text-muted-foreground" />
                <div className="space-y-1 text-sm">
                  <div className="font-medium">
                    {t("nextDeadline", {
                      type: nextDeadline.filingType,
                      period: nextDeadline.period,
                    })}
                  </div>
                  <div className="text-muted-foreground">
                    {nextDeadline.deadline} -{" "}
                    {daysLabel(nextDeadline.daysRemaining, t("overdue"))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                {t("noFilings")}
              </div>
            )}

            {overdueDeadlines > 0 && (
              <Badge variant="destructive">
                {t("overdueFilings", { count: overdueDeadlines })}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("monthlyChecklist")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {monthlyChecklist.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 font-medium">
                  <item.icon className="size-4 text-muted-foreground" />
                  {item.label}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {item.detail}
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
