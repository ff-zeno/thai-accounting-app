import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The toolbar above a collection: search, a few narrow filters, and the
 * collection's actions, in that reading order. One composition for every
 * list surface so filters sit in the same place in every app.
 *
 *   <FilterBar>
 *     <FilterBarSearch><Input type="search" … /></FilterBarSearch>
 *     <Select … />                            // narrow filters, natural width
 *     <FilterBarActions><Button … /></FilterBarActions>
 *   </FilterBar>
 *
 * At mobile widths the search takes its own full row (thumb-first: search is
 * the primary tool on a phone) and the filters wrap beneath it; from `sm` up
 * everything shares one row with search flexing and actions pushed to the
 * trailing edge. No configuration — surfaces that fight this order are
 * telling you they need a different surface, not more props.
 *
 * Vendored from the suite kit (packages/ui/src/components/filter-bar.tsx);
 * re-sync from there, don't fork.
 */
function FilterBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

function FilterBarSearch({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar-search"
      className={cn(
        "min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto",
        className
      )}
      {...props}
    />
  )
}

function FilterBarActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar-actions"
      className={cn("ms-auto flex items-center gap-2", className)}
      {...props}
    />
  )
}

export { FilterBar, FilterBarSearch, FilterBarActions }
