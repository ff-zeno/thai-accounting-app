"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Ledger table (DESIGN.md 2026-08-05 — owner decision T1).
 *
 * A table is data on paper, not a boxed widget: no header fill, no zebra, no
 * inner grid. Structure comes from hairline row rules, a caption-cased column
 * header, and the ruled total in `TableFooter`. The surface underneath is the
 * card's — `Table` draws no background of its own, which is why it must be
 * composed inside `TableCard` (or a `Card`) rather than a bare bordered div.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

/**
 * The totals row, ruled the way a ledger rules one (DESIGN.md 2026-08-05 —
 * owner decision F2): a single rule separating the total from the entries, and
 * a double rule closing the final line. It sits on the card surface rather
 * than a grey band, so the total reads as the end of the column of figures
 * instead of a separate widget.
 */
function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border font-medium [&>tr]:border-b-0 [&>tr:last-child>td]:border-b-[3px] [&>tr:last-child>td]:border-double [&>tr:last-child>td]:border-b-border",
        className
      )}
      {...props}
    />
  )
}

/**
 * Selection is an ink bar in the first cell, drawn as an inset shadow so it
 * costs no width and the column never jumps as rows are selected.
 */
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors hover:bg-accent/45 data-[state=selected]:bg-accent/60 data-[state=selected]:[&>*:first-child]:shadow-[inset_2px_0_0_0_var(--primary)]",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // Caption case at the 12px floor DESIGN.md sets — never smaller, even
        // though uppercase would tolerate it. The outer columns take the card's
        // own padding so the ledger aligns with the card title above it.
        "h-9 px-3 text-left align-middle text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
