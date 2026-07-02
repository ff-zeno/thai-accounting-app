import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  Bot,
  BookOpen,
  Boxes,
  Calendar,
  Camera,
  ClipboardList,
  FileText,
  FolderKanban,
  GitCompareArrows,
  Home,
  Landmark,
  Layers3,
  Lightbulb,
  LineChart,
  LockKeyhole,
  MoreHorizontal,
  PackageSearch,
  Receipt,
  Settings,
  ShoppingCart,
  SplitSquareVertical,
  Upload,
  Users,
  UsersRound,
} from "lucide-react";

export interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  labelKey: string;
  items: NavItem[];
}

export interface NavCategory {
  labelKey: string;
  icon: LucideIcon;
  href: string;
  sections: NavSection[];
}

export const navCategories: NavCategory[] = [
  {
    labelKey: "home",
    icon: Home,
    href: "/dashboard",
    sections: [
      {
        labelKey: "home",
        items: [{ labelKey: "home", href: "/dashboard", icon: Home }],
      },
    ],
  },
  {
    labelKey: "bank",
    icon: Landmark,
    href: "/bank-accounts",
    sections: [
      {
        labelKey: "bank",
        items: [
          { labelKey: "bankAccounts", href: "/bank-accounts", icon: Landmark },
          { labelKey: "uploadStatement", href: "/bank-accounts/upload", icon: Upload },
        ],
      },
    ],
  },
  {
    labelKey: "documents",
    icon: FileText,
    href: "/documents/expenses",
    sections: [
      {
        labelKey: "documents",
        items: [
          { labelKey: "expenses", href: "/documents/expenses", icon: FileText },
          { labelKey: "income", href: "/documents/income", icon: FileText },
          { labelKey: "upload", href: "/documents/upload", icon: Upload },
          { labelKey: "capture", href: "/capture", icon: Camera },
        ],
      },
    ],
  },
  {
    labelKey: "reconciliationGroup",
    icon: GitCompareArrows,
    href: "/reconciliation",
    sections: [
      {
        labelKey: "reconciliationGroup",
        items: [
          { labelKey: "overview", href: "/reconciliation", icon: GitCompareArrows },
          { labelKey: "aiReview", href: "/reconciliation/ai-review", icon: Bot },
          { labelKey: "reconciliationReview", href: "/reconciliation/review", icon: ArrowRightLeft },
          { labelKey: "insights", href: "/reconciliation/insights", icon: Lightbulb },
          { labelKey: "reconciliationRules", href: "/settings/reconciliation-rules", icon: Settings },
        ],
      },
    ],
  },
  {
    labelKey: "tax",
    icon: Receipt,
    href: "/tax/vat",
    sections: [
      {
        labelKey: "taxVat",
        items: [
          { labelKey: "vatDashboard", href: "/tax/vat", icon: BarChart3 },
          { labelKey: "inputVat", href: "/tax/vat/input", icon: Receipt },
          { labelKey: "outputVat", href: "/tax/vat/output", icon: Receipt },
          { labelKey: "vatRegister", href: "/tax/vat/register", icon: FileText },
          { labelKey: "vatFilings", href: "/tax/vat/filings", icon: FileText },
          { labelKey: "vatForecast", href: "/tax/vat/forecast", icon: BarChart3 },
        ],
      },
      {
        labelKey: "withholdingTax",
        items: [
          { labelKey: "whtDashboard", href: "/tax/withholding", icon: BarChart3 },
          { labelKey: "incomingWht", href: "/tax/withholding/incoming", icon: Receipt },
          { labelKey: "outgoingWht", href: "/tax/withholding/outgoing", icon: Receipt },
          { labelKey: "whtRegister", href: "/tax/withholding/register", icon: FileText },
          { labelKey: "whtFilings", href: "/tax/withholding/filings", icon: FileText },
        ],
      },
      {
        labelKey: "taxPlanning",
        items: [
          { labelKey: "taxCalendar", href: "/tax/calendar", icon: Calendar },
          { labelKey: "statutoryReports", href: "/tax/reports", icon: FileText },
        ],
      },
    ],
  },
  {
    labelKey: "more",
    icon: MoreHorizontal,
    href: "/accounting",
    sections: [
      {
        labelKey: "inventoryImports",
        items: [
          { labelKey: "inventoryControl", href: "/inventory", icon: Boxes },
          { labelKey: "importsControl", href: "/imports", icon: PackageSearch },
        ],
      },
      {
        labelKey: "accountingReports",
        items: [
          { labelKey: "generalLedger", href: "/accounting", icon: BookOpen },
          { labelKey: "journal", href: "/accounting/journal", icon: BookOpen },
          { labelKey: "postingExceptions", href: "/accounting/posting-exceptions", icon: Activity },
          { labelKey: "trialBalance", href: "/accounting/reports/trial-balance", icon: BarChart3 },
          { labelKey: "balanceSheet", href: "/accounting/reports/balance-sheet", icon: BarChart3 },
          { labelKey: "profitLoss", href: "/accounting/reports/profit-loss", icon: BarChart3 },
          { labelKey: "generalLedgerReport", href: "/accounting/reports/general-ledger", icon: BookOpen },
          { labelKey: "reports", href: "/reports", icon: BarChart3 },
          { labelKey: "arAging", href: "/analytics/ar-aging", icon: LineChart },
          { labelKey: "apAging", href: "/analytics/ap-aging", icon: LineChart },
          { labelKey: "cashForecast", href: "/analytics/cash-flow", icon: LineChart },
          { labelKey: "concentration", href: "/analytics/concentration", icon: BarChart3 },
          { labelKey: "profitability", href: "/analytics/profitability", icon: BarChart3 },
          { labelKey: "fxRates", href: "/analytics/fx-rates", icon: Landmark },
        ],
      },
      {
        labelKey: "payrollAssets",
        items: [
          { labelKey: "payrollControl", href: "/payroll", icon: UsersRound },
          { labelKey: "fixedAssetRegister", href: "/fixed-assets", icon: ClipboardList },
          { labelKey: "fixedAssetRollForward", href: "/fixed-assets/reports/roll-forward", icon: ClipboardList },
        ],
      },
      {
        labelKey: "yearEndClose",
        items: [
          { labelKey: "closeChecklist", href: "/close", icon: LockKeyhole },
          { labelKey: "citWorkbench", href: "/year-end/cit", icon: Landmark },
        ],
      },
      {
        labelKey: "management",
        items: [
          { labelKey: "vendors", href: "/vendors", icon: Users },
          { labelKey: "settings", href: "/settings", icon: Settings },
          { labelKey: "costCenters", href: "/settings/cost-centers", icon: Layers3 },
          { labelKey: "projects", href: "/settings/projects", icon: FolderKanban },
          { labelKey: "allocationRules", href: "/settings/allocation-rules", icon: SplitSquareVertical },
        ],
      },
      {
        labelKey: "toolsAdmin",
        items: [
          { labelKey: "salesControl", href: "/sales", icon: ShoppingCart },
          { labelKey: "accountingCopilot", href: "/copilot", icon: Bot },
          {
            labelKey: "extractionHealth",
            href: "/admin/extraction-health",
            icon: Activity,
          },
        ],
      },
    ],
  },
];

function isHrefActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  return pathname.startsWith(`${href}/`);
}

export function getActiveNavItem(pathname: string): NavItem | null {
  const items = navCategories.flatMap((category) =>
    category.sections.flatMap((section) => section.items)
  );
  return (
    items
      .filter((item) => isHrefActive(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

export function getActiveNavCategory(pathname: string): NavCategory {
  const activeItem = getActiveNavItem(pathname);
  const category =
    activeItem &&
    navCategories.find((entry) =>
      entry.sections.some((section) =>
        section.items.some((item) => item.href === activeItem.href)
      )
    );

  return category ?? navCategories[0];
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  return getActiveNavItem(pathname)?.href === item.href;
}
