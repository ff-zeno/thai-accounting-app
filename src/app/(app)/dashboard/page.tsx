import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
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
import { StatCard } from "@/components/ui/stat-card";
import {
  getAttentionCounts,
  getOwnerHomeMetrics,
  type ReviewException,
} from "@/lib/db/queries/dashboard";
import { listPins } from "@/lib/db/queries/user-nav-pins";
import { resolvePinnedNavItems } from "@/lib/nav/pins";
import { getObligationsWithStatus } from "@/lib/tax/obligations";
import { StatusBadge } from "@/components/status-badge";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getCurrentUser } from "@/lib/utils/auth";
import { formatThb } from "./format";

/** Fallback shortcuts shown until the user pins their own nav items. */
const DEFAULT_SHORTCUTS = [
  { label: "Upload document", href: "/documents/upload", icon: Upload },
  { label: "Reconciliation", href: "/reconciliation", icon: ArrowRightLeft },
  { label: "VAT", href: "/tax/vat", icon: Receipt },
];

const bangkokShortDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  day: "numeric",
  month: "short",
});

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
  // Filings due this month cover the previous calendar month's tax period.
  const filingPeriod =
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const tNav = await getTranslations("nav");
  const user = await getCurrentUser();
  const [metrics, attention, pins, obligationsSnapshot] = await Promise.all([
    getOwnerHomeMetrics(orgId, year, month),
    getAttentionCounts(orgId),
    user ? listPins(orgId, user.id) : Promise.resolve([]),
    getObligationsWithStatus(orgId, filingPeriod),
  ]);
  const pinnedItems = resolvePinnedNavItems(pins.map((pin) => pin.href));
  const shortcuts =
    pinnedItems.length > 0
      ? pinnedItems.map((item) => ({
          label: tNav(item.labelKey),
          href: item.href,
          icon: item.icon,
        }))
      : DEFAULT_SHORTCUTS;
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Needs your attention</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/documents/expenses" className="block">
            <StatCard
              className="h-full transition-colors hover:bg-muted/50"
              label="Documents to review"
              value={attention.documentsNeedingReview}
              hint="Uploaded documents waiting for your confirmation"
              icon={<FileText />}
            />
          </Link>
          <Link href="/reconciliation" className="block">
            <StatCard
              className="h-full transition-colors hover:bg-muted/50"
              label="Unmatched bank transactions"
              value={attention.unmatchedTransactions}
              hint="Bank lines without a matched document"
              icon={<ArrowRightLeft />}
            />
          </Link>
          <Link href="/reconciliation/ai-review" className="block">
            <StatCard
              className="h-full transition-colors hover:bg-muted/50"
              label="AI suggestions pending"
              value={attention.pendingAiSuggestions}
              hint="Proposed matches awaiting approve/reject"
              icon={<Bot />}
            />
          </Link>
        </div>
        {obligationsSnapshot && obligationsSnapshot.obligations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Filings due this month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {obligationsSnapshot.obligations.map((obligation) => (
                  <Link
                    key={obligation.key}
                    href={obligation.workbenchHref}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{obligation.form}</div>
                      <div className="text-xs text-muted-foreground">
                        Due {bangkokShortDate.format(obligation.dueDate)}
                        {obligation.dueDateIsEfiling ? " (e-filing)" : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={obligation.displayStatus} />
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
              <Link
                href="/tax"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                What do these mean? Open Compliance
                <ChevronRight className="size-3.5" />
              </Link>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Pinned shortcuts</h2>
          {pinnedItems.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Suggestions — star any item in the sidebar to pin your own
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {shortcuts.map((shortcut) => (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className="flex items-center gap-2 rounded-md border p-3 font-medium transition-colors hover:bg-muted/50"
            >
              <shortcut.icon className="size-4 text-muted-foreground" />
              {shortcut.label}
            </Link>
          ))}
        </div>
      </section>

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
