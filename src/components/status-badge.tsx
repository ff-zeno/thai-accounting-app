import * as React from "react"

import { Badge, badgeVariants } from "@/components/ui/badge"
import type { VariantProps } from "class-variance-authority"

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

/**
 * One registry so the same domain status renders identically everywhere:
 * dashboard, tax tables, payroll, accounting, close. Add statuses here —
 * never a local status→variant switch in a page.
 *
 * Lifecycle convention: outline = not started, info = in flight,
 * success = terminal-good, warning = needs human, destructive = terminal-bad
 * or urgent, secondary = superseded/inactive.
 */
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
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
  completed: "success",
  failed: "destructive",
  // reconciliation
  matched: "success",
  unmatched: "warning",
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

function humanize(status: string): string {
  return status
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
}

function StatusBadge({
  status,
  label,
  className,
}: {
  status: string
  /** Override the auto-humanized label (e.g. a translated string). */
  label?: React.ReactNode
  className?: string
}) {
  const normalized = status.toLowerCase()
  const variant =
    STATUS_VARIANTS[normalized] ??
    // pipeline failure states are prefixed: failed_quality, failed_extraction…
    (normalized.startsWith("failed") ? "destructive" : "secondary")
  return (
    <Badge variant={variant} className={className}>
      {label ?? humanize(normalized)}
    </Badge>
  )
}

export { StatusBadge, STATUS_VARIANTS }
