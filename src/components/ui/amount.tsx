import * as React from "react"

import { cn } from "@/lib/utils"
import { splitAmountParts, toSatang } from "@/lib/utils/money"

/**
 * Canonical money rendering: shared formatter + tabular-nums (DESIGN.md —
 * Geist Sans, not mono). `signed` adds a +/− prefix with success/destructive
 * tones for credit/debit columns.
 *
 * The satang half renders smaller and lighter than the baht (DESIGN.md
 * 2026-08-05 — owner decision F1) so a column of figures scans on the baht.
 * Its size is `max(12px, 0.85em)`: the step is relative so it holds at every
 * scale from a caption to a 30px stat, and the floor keeps it at or above the
 * 12px minimum type size DESIGN.md sets. The two halves are adjacent text
 * nodes, so copy-paste and screen readers still get one whole number.
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
  const { baht, satang: satangText } = splitAmountParts(value)
  return (
    <span
      data-slot="amount"
      className={cn("tabular-nums", signed && tone, className)}
    >
      {prefix}
      {baht}
      {satangText && (
        <span
          data-slot="amount-satang"
          className="text-[max(12px,0.85em)] opacity-70"
        >
          {satangText}
        </span>
      )}
    </span>
  )
}

export { Amount }
