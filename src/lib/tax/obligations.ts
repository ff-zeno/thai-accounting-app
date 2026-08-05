import {
  adjustToNextThaiBusinessDay,
  pp30EfilingDeadline,
  pp36Deadline,
  whtEfilingDeadline,
  whtPaperDeadline,
  type TaxConfigValues,
} from "./filing-deadlines";

/**
 * Monthly compliance obligations engine.
 *
 * Pure core: `deriveObligations` / `deriveNotApplicableObligations` turn an
 * org tax profile + a tax period into the list of forms the org must (or
 * need not) file, with plain-English education copy and business-day
 * adjusted deadlines from the existing deadline engine.
 *
 * Thin data layer: `getObligationsWithStatus` joins the derived obligations
 * with actual filing rows (vat_filings, wht_monthly_filings, pnd_filings,
 * sso_filings). DB modules are imported lazily so the pure core stays
 * loadable without DATABASE_URL (unit tests).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaxProfile {
  isVatRegistered: boolean;
  hasEmployees: boolean;
  hasImportedServices: boolean;
}

export interface TaxPeriod {
  year: number;
  /** 1-12 — the tax period being filed. Deadlines land in the month after. */
  month: number;
}

export type ObligationKey = "pp30" | "pp36" | "pnd3_53" | "pnd1" | "sso";

export interface Obligation {
  key: ObligationKey;
  /** Display name of the form(s), e.g. "PP 30" or "PND 3 / PND 53". */
  form: string;
  /** Plain-English reason this obligation applies to the org. */
  appliesBecause: string;
  /** Caveat shown on always-on obligations, e.g. "only if you withheld". */
  conditionalNote?: string;
  /** Business-day adjusted deadline (Bangkok). */
  dueDate: Date;
  /** True when dueDate is itself the e-filing deadline (no paper date in the engine). */
  dueDateIsEfiling: boolean;
  /** Later e-filing deadline where the engine supports a separate one. */
  efilingDueDate?: Date;
  /** What this form is, in plain English. */
  what: string;
  /** Why it exists / what it settles. */
  why: string;
  /**
   * The workbench route where the user acts on this obligation. Absent for
   * awareness-only obligations the app tracks the deadline for but cannot file
   * (PND 1 and SSO — see docs/deferred-features.md).
   */
  workbenchHref?: string;
}

export interface NotApplicableObligation {
  key: ObligationKey;
  form: string;
  /** Why the obligation is gated off for this profile — the education. */
  reason: string;
}

export type ObligationStatus =
  | "not_started"
  | "draft"
  | "filed"
  | "paid"
  | "unknown";

export interface ObligationWithStatus extends Obligation {
  status: ObligationStatus;
  /**
   * Raw status string for badge display (e.g. "ready_for_review",
   * "rejected"). Falls back to the normalized status.
   */
  displayStatus: string;
}

// ---------------------------------------------------------------------------
// Deadline helpers
// ---------------------------------------------------------------------------

/**
 * SSO contributions are due by the 15th of the month following the pay
 * period (Social Security Act). The deadline engine has no SSO entry, so we
 * apply the same Thai business-day rolling to the statutory day.
 */
const SSO_DEADLINE_DAY = 15;

function deadlineInFollowingMonth(period: TaxPeriod, dayOfMonth: number): Date {
  const nextMonth = period.month + 1;
  const year = nextMonth > 12 ? period.year + 1 : period.year;
  const month = nextMonth > 12 ? 1 : nextMonth;
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
    dayOfMonth
  ).padStart(2, "0")}`;
  return adjustToNextThaiBusinessDay(new Date(`${dateStr}T00:00:00+07:00`));
}

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

/**
 * Derive the obligations that APPLY to an org for a tax period.
 * Ordered by due date grouping: VAT forms, WHT remittance, payroll.
 */
export function deriveObligations(
  profile: TaxProfile,
  period: TaxPeriod,
  config: TaxConfigValues
): Obligation[] {
  const obligations: Obligation[] = [];

  if (profile.isVatRegistered) {
    obligations.push({
      key: "pp30",
      form: "PP 30",
      appliesBecause: "Your organization is VAT registered.",
      dueDate: pp30EfilingDeadline(period.year, period.month, config).deadline,
      dueDateIsEfiling: true,
      what: "Your monthly VAT return. You collected VAT on sales and paid VAT on purchases; this form settles the difference with the Revenue Department.",
      why: "VAT-registered businesses must report every month — even months with no sales.",
      workbenchHref: "/tax/vat",
    });
  }

  if (profile.hasImportedServices) {
    obligations.push({
      key: "pp36",
      form: "PP 36",
      appliesBecause:
        "Your organization buys services from foreign providers (e.g. ads, software, cloud services).",
      dueDate: pp36Deadline(period.year, period.month, config).deadline,
      dueDateIsEfiling: false,
      what: "Self-assessed VAT on services bought from abroad. The foreign provider cannot charge Thai VAT, so you pay it on their behalf.",
      why: "Filed separately from PP 30 — the VAT you pay here can usually be reclaimed as input VAT on a later PP 30.",
      workbenchHref: "/tax/vat",
    });
  }

  // WHT remittance applies to every business that pays vendors.
  obligations.push({
    key: "pnd3_53",
    form: "PND 3 / PND 53",
    appliesBecause:
      "Every business must remit the tax it withholds when paying vendors — PND 3 for individuals, PND 53 for companies.",
    conditionalNote:
      "Only due if you withheld tax from a vendor payment this month.",
    dueDate: whtPaperDeadline(period.year, period.month, config).deadline,
    dueDateIsEfiling: false,
    efilingDueDate: whtEfilingDeadline(period.year, period.month, config)
      .deadline,
    what: "Remits the withholding tax you deducted from vendor payments (services, rent, professional fees) to the Revenue Department.",
    why: "You withheld part of the vendor's income tax at payment time; this form passes it on and matches the certificates you issued.",
    workbenchHref: "/tax/withholding/filings",
  });

  // PND 1 and SSO are payroll filings. Payroll was removed from the app, so
  // these stay as awareness-only deadlines: the statutory date is still real
  // and still the owner's problem, the app just cannot file or track it.
  if (profile.hasEmployees) {
    obligations.push({
      key: "pnd1",
      form: "PND 1",
      appliesBecause: "Your organization has employees.",
      conditionalNote: "Filed outside this app — the deadline is shown for awareness.",
      dueDate: whtPaperDeadline(period.year, period.month, config).deadline,
      dueDateIsEfiling: false,
      efilingDueDate: whtEfilingDeadline(period.year, period.month, config)
        .deadline,
      what: "Remits the personal income tax withheld from your employees' salaries this month.",
      why: "Employers withhold income tax from every payroll run and pass it to the Revenue Department monthly.",
    });

    obligations.push({
      key: "sso",
      form: "SSO",
      appliesBecause: "Your organization has employees.",
      conditionalNote: "Filed outside this app — the deadline is shown for awareness.",
      dueDate: deadlineInFollowingMonth(period, SSO_DEADLINE_DAY),
      dueDateIsEfiling: false,
      what: "Monthly social security contributions — the amounts deducted from employee salaries plus your matching employer share.",
      why: "Paid to the Social Security Office (not the Revenue Department); it funds employee health care, unemployment and pension benefits.",
    });
  }

  return obligations;
}

/**
 * The obligations gated OFF by the profile, with the reason — so the UI can
 * teach users why a form does not apply to their business.
 */
export function deriveNotApplicableObligations(
  profile: TaxProfile
): NotApplicableObligation[] {
  const skipped: NotApplicableObligation[] = [];

  if (!profile.isVatRegistered) {
    skipped.push({
      key: "pp30",
      form: "PP 30",
      reason:
        "You are not VAT registered, so there is no monthly VAT return to file. VAT registration becomes mandatory once revenue exceeds THB 1.8M per year.",
    });
  }

  if (!profile.hasImportedServices) {
    skipped.push({
      key: "pp36",
      form: "PP 36",
      reason:
        "You told us you don't buy services from foreign providers. If you start paying for foreign ads, software or cloud services, PP 36 self-assessed VAT applies.",
    });
  }

  if (!profile.hasEmployees) {
    skipped.push({
      key: "pnd1",
      form: "PND 1",
      reason:
        "You have no employees, so there is no payroll withholding tax to remit.",
    });
    skipped.push({
      key: "sso",
      form: "SSO",
      reason:
        "You have no employees, so no social security contributions are due.",
    });
  }

  return skipped;
}

// ---------------------------------------------------------------------------
// Status mapping helpers (pure)
// ---------------------------------------------------------------------------

const WHT_STATUS_RANK: Record<string, number> = { draft: 0, filed: 1, paid: 2 };

/** Least-advanced status across the WHT filing rows that exist. */
function combineWhtStatuses(
  statuses: Array<"draft" | "filed" | "paid">
): ObligationStatus {
  if (statuses.length === 0) return "not_started";
  return statuses.reduce((least, status) =>
    WHT_STATUS_RANK[status] < WHT_STATUS_RANK[least] ? status : least
  );
}

function mapVatFilingStatus(filing: {
  status: string;
  paymentStatus: string;
  paidAt: Date | null;
}): { status: ObligationStatus; displayStatus: string } {
  switch (filing.status) {
    case "draft":
    case "ready_for_review":
      return { status: "draft", displayStatus: filing.status };
    case "filed":
    case "amended": {
      const paid =
        filing.paidAt !== null || filing.paymentStatus === "tax_paid";
      return paid
        ? { status: "paid", displayStatus: "paid" }
        : { status: "filed", displayStatus: filing.status };
    }
    case "voided":
      return { status: "not_started", displayStatus: "not_started" };
    default:
      return { status: "unknown", displayStatus: filing.status };
  }
}

// ---------------------------------------------------------------------------
// Data layer
// ---------------------------------------------------------------------------

export interface ObligationsSnapshot {
  period: TaxPeriod;
  obligations: ObligationWithStatus[];
  notApplicable: NotApplicableObligation[];
}

/**
 * Derive obligations for the org's tax profile and join each with its actual
 * filing status. Org-scoped throughout; returns null when the org is missing.
 */
export async function getObligationsWithStatus(
  orgId: string,
  period: TaxPeriod
): Promise<ObligationsSnapshot | null> {
  // Lazy imports keep the pure core loadable without DATABASE_URL.
  const [
    { getOrganizationById },
    { getFilingDeadlineConfig },
    { getFilingsByPeriod },
  ] = await Promise.all([
    import("@/lib/db/queries/organizations"),
    import("@/lib/db/queries/tax-config"),
    import("@/lib/db/queries/wht-filings"),
  ]);

  const org = await getOrganizationById(orgId);
  if (!org) return null;

  const profile: TaxProfile = {
    isVatRegistered: org.isVatRegistered ?? false,
    hasEmployees: org.hasEmployees,
    hasImportedServices: org.hasImportedServices,
  };

  const config = await getFilingDeadlineConfig();
  const obligations = deriveObligations(profile, period, config);
  const notApplicable = deriveNotApplicableObligations(profile);

  const withStatus: ObligationWithStatus[] = await Promise.all(
    obligations.map(async (obligation) => {
      switch (obligation.key) {
        case "pp30":
        case "pp36": {
          const filing = await getLatestVatFiling(
            orgId,
            obligation.key,
            period
          );
          if (!filing) {
            return {
              ...obligation,
              status: "not_started" as const,
              displayStatus: "not_started",
            };
          }
          return { ...obligation, ...mapVatFilingStatus(filing) };
        }
        case "pnd3_53": {
          const filings = await getFilingsByPeriod(
            orgId,
            period.year,
            period.month
          );
          const statuses = filings
            .filter((f) => f.formType === "pnd3" || f.formType === "pnd53")
            .map((f) => f.status);
          const status = combineWhtStatuses(statuses);
          return { ...obligation, status, displayStatus: status };
        }
        // Payroll filings are awareness-only — nothing in the app records
        // whether they were filed, so we say so rather than guess.
        case "pnd1":
        case "sso":
          return {
            ...obligation,
            status: "unknown" as const,
            displayStatus: "not_tracked",
          };
      }
    })
  );

  return { period, obligations: withStatus, notApplicable };
}

/**
 * Latest ordinary (non-amendment) VAT filing row for the period, preferring
 * the most advanced status — mirrors getVatLedgerPeriodDashboard's pick.
 */
async function getLatestVatFiling(
  orgId: string,
  filingType: "pp30" | "pp36",
  period: TaxPeriod
) {
  const [{ db }, { vatFilings }, { and, eq, sql }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/schema"),
    import("drizzle-orm"),
  ]);

  const rows = await db
    .select({
      status: vatFilings.status,
      paymentStatus: vatFilings.paymentStatus,
      paidAt: vatFilings.paidAt,
    })
    .from(vatFilings)
    .where(
      and(
        eq(vatFilings.orgId, orgId),
        eq(vatFilings.filingType, filingType),
        eq(vatFilings.periodYear, period.year),
        eq(vatFilings.periodMonth, period.month),
        eq(vatFilings.filingKind, "ordinary"),
        sql`${vatFilings.deletedAt} IS NULL`
      )
    )
    .orderBy(
      sql`
      CASE ${vatFilings.status}
        WHEN 'filed' THEN 0
        WHEN 'ready_for_review' THEN 1
        WHEN 'draft' THEN 2
        ELSE 3
      END
    `,
      sql`${vatFilings.createdAt} DESC`
    )
    .limit(1);

  return rows[0] ?? null;
}
