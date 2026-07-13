import * as React from "react"

import { cn } from "@/lib/utils"
import { formatAmount, toSatang } from "@/lib/utils/money"

/**
 * Canonical money rendering: shared formatter + tabular-nums (DESIGN.md —
 * Geist Sans, not mono). `signed` adds a +/− prefix with success/destructive
 * tones for credit/debit columns.
 */
function Amount({
  value,
  signed = false,
  nullDash = false,
  className,
}: {
  value: string | number | null | undefined
  /** Color positive amounts success, negative destructive, with sign prefix. */
  signed?: boolean
  /** Render an em dash instead of 0.00 for null/undefined. */
  nullDash?: boolean
  className?: string
}) {
  if (value == null && nullDash) {
    return (
      <span
        data-slot="amount"
        className={cn("tabular-nums text-muted-foreground", className)}
      >
        —
      </span>
    )
  }
  const satang = signed ? toSatang(value == null ? null : String(value)) : null
  const tone =
    satang == null || satang === 0
      ? ""
      : satang > 0
        ? "text-success"
        : "text-destructive"
  const prefix = satang != null && satang > 0 ? "+" : ""
  return (
    <span
      data-slot="amount"
      className={cn("tabular-nums", signed && tone, className)}
    >
      {prefix}
      {formatAmount(value)}
    </span>
  )
}

export { Amount }
