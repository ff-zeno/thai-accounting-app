import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  CreditCard,
  Globe,
  HandCoins,
  Landmark,
  PieChart,
  Scale,
  TrendingUp,
  Wallet,
} from "lucide-react";

/**
 * Single source of truth for the Reports hub (/accounting/reports) and the
 * ReportSwitcher. Descriptions state the question each report answers —
 * education is core product. Hrefs must match real routes under
 * /accounting/reports/* and /analytics/*.
 */

export interface ReportEntry {
  title: string;
  href: string;
  /** One line, plain language: what question does this report answer? */
  description: string;
  icon: LucideIcon;
}

export interface ReportGroup {
  title: string;
  reports: ReportEntry[];
}

export const reportGroups: ReportGroup[] = [
  {
    title: "Financial statements",
    reports: [
      {
        title: "Trial Balance",
        href: "/accounting/reports/trial-balance",
        description:
          "Do the books balance? Debit and credit totals for every account, side by side.",
        icon: Scale,
      },
      {
        title: "Balance Sheet",
        href: "/accounting/reports/balance-sheet",
        description:
          "What does the business own and owe right now, and what is left for the owners?",
        icon: Landmark,
      },
      {
        title: "Profit & Loss",
        href: "/accounting/reports/profit-loss",
        description:
          "Did we make money this period — and where did it come from and go?",
        icon: TrendingUp,
      },
      {
        title: "General Ledger Report",
        href: "/accounting/reports/general-ledger",
        description:
          "What exactly happened in an account? Every posted line, in order, with its source.",
        icon: BookOpen,
      },
    ],
  },
  {
    title: "Receivables & payables",
    reports: [
      {
        title: "AR Aging",
        href: "/analytics/ar-aging",
        description: "Who owes us money, and how overdue is it?",
        icon: HandCoins,
      },
      {
        title: "AP Aging",
        href: "/analytics/ap-aging",
        description: "Who do we owe, and which bills are due first?",
        icon: CreditCard,
      },
    ],
  },
  {
    title: "Cash & analysis",
    reports: [
      {
        title: "Cash Forecast",
        href: "/analytics/cash-flow",
        description:
          "Will we have enough cash over the next 30 days, and how long is the runway?",
        icon: Wallet,
      },
      {
        title: "Concentration",
        href: "/analytics/concentration",
        description:
          "Are we depending too much on a single customer or vendor?",
        icon: PieChart,
      },
      {
        title: "Profitability",
        href: "/analytics/profitability",
        description:
          "Which cost centers and projects actually make money after expenses?",
        icon: BarChart3,
      },
      {
        title: "FX Rates",
        href: "/analytics/fx-rates",
        description:
          "Which exchange rates are we using to value foreign-currency amounts?",
        icon: Globe,
      },
    ],
  },
];
