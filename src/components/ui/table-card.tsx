import * as React from "react"

import { cn } from "@/lib/utils"
import { Card, CardAction, CardDescription, CardTitle } from "@/components/ui/card"
import type { SectionTone } from "@/lib/ui/section-tone"

/**
 * The card a ledger table lives in (DESIGN.md 2026-08-05 — owner decision T1).
 *
 * Tables were the one major surface that never joined the card system: every
 * call site wrapped `Table` in `rounded-md border`, which gave a 8px radius
 * against the card's 14px, no `bg-card`, and no shadow — a table floating on
 * the page canvas next to cards that sat on paper. `TableCard` is that missing
 * wrapper, so a table is a `Card` like everything else.
 *
 * The table region is full-bleed: it gets no horizontal padding, so row rules
 * run edge to edge and the card border closes the column instead of a second
 * inner box. Header and footer keep the card's own padding.
 *
 * Pass `tone` only on a page's primary table; see `Card` for why.
 */
function TableCard({
  title,
  description,
  action,
  footer,
  tone,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Card>, "title"> & {
  /** Omit along with `description`/`action` to render a bare table card. */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Filters, exports, and the like — sits opposite the title. */
  action?: React.ReactNode
  /** Pagination or a summary line, below the table on the card surface. */
  footer?: React.ReactNode
  tone?: SectionTone
}) {
  const hasHeader = title != null || description != null || action != null
  return (
    <Card tone={tone} className={cn("gap-0 py-0", className)} {...props}>
      {hasHeader && (
        <div
          data-slot="table-card-header"
          className="grid auto-rows-min items-start gap-1 border-b border-border px-4 py-3 has-data-[slot=card-action]:grid-cols-[1fr_auto]"
        >
          {title != null && <CardTitle>{title}</CardTitle>}
          {description != null && <CardDescription>{description}</CardDescription>}
          {action != null && <CardAction>{action}</CardAction>}
        </div>
      )}
      {children}
      {footer != null && (
        <div
          data-slot="table-card-footer"
          className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm"
        >
          {footer}
        </div>
      )}
    </Card>
  )
}

export { TableCard }
