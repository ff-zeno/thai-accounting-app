import type { VariantProps } from "class-variance-authority"

import type { badgeVariants } from "@/components/ui/badge"

export type StatusBadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>["variant"]
>

/**
 * One registry so the same domain status renders identically everywhere:
 * dashboard, tax tables, payroll, accounting, close. Add statuses here —
 * never a local status→variant switch in a page.
 *
 * Lifecycle convention: outline = not started, info = in flight,
 * success = terminal-good, warning = needs human, destructive = terminal-bad
 * or urgent, secondary = superseded/inactive.
 */
export const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  // shared filing lifecycle (WHT monthly, VAT, payroll PND/SSO, CIT)
  draft: "outline",
  submitted: "info",
  accepted: "success",
  filed: "info",
  paid: "success",
  rejected: "destructive",
  voided: "secondary",
  replaced: "secondary",
  amended: "secondary",
  // deadlines (tax calendar)
  upcoming: "secondary",
  due_soon: "warning",
  overdue: "destructive",
  // certificates
  issued: "success",
  // documents & pipeline
  confirmed: "success",
  needs_review: "warning",
  uploaded: "secondary",
  extracting: "info",
  validating: "info",
  validated: "info",
  processing: "info",
  completed: "success",
  completed_with_warning: "warning",
  failed: "destructive",
  // VAT ledger items (input / output / PP36 obligations)
  awaiting_tax_invoice: "warning",
  claimable: "info",
  held: "warning",
  do_not_claim: "secondary",
  allocated_to_draft: "info",
  expired: "destructive",
  voided_by_amendment: "secondary",
  reportable: "info",
  pp36_required: "warning",
  allocated_to_draft_pp36: "info",
  pp36_filed: "info",
  pp36_paid: "success",
  eligible_for_pp30_reclaim: "info",
  reclaimed_in_pp30: "success",
  // VAT filing lifecycle + payment position
  not_built: "outline",
  ready_for_review: "warning",
  not_required: "secondary",
  // payroll deadlines the app shows but cannot file (PND 1, SSO)
  not_tracked: "secondary",
  waiting_to_pay_tax: "warning",
  tax_paid: "success",
  refund_or_credit: "info",
  // reconciliation
  matched: "success",
  partially_matched: "info",
  unmatched: "warning",
  // processor_settlements.reconciliation_status defaults to this — a payout
  // the matcher has not yet claimed against a bank deposit.
  unreconciled: "warning",
  // processor_settlements: the matcher claimed a deposit, a human has not
  // confirmed it yet.
  suggested: "info",
  ambiguous: "warning",
  ai_suggested: "info",
  approved: "success",
  pending: "warning",
  // pay runs
  open: "outline",
  closed: "secondary",
  blocked: "destructive",
  skipped: "secondary",
  done: "success",
}

export function statusVariant(status: string): StatusBadgeVariant {
  const normalized = status.toLowerCase()
  return (
    STATUS_VARIANTS[normalized] ??
    // pipeline failure states are prefixed: failed_quality, failed_extraction…
    (normalized.startsWith("failed") ? "destructive" : "secondary")
  )
}

export function humanizeStatus(status: string): string {
  return status.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}
