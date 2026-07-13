import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Canonical page scaffolding: title (24px/600 per DESIGN.md) with optional
 * description on the left, actions on the right. Children render as actions.
 */
function PageHeader({
  title,
  description,
  className,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  )
}

export { PageHeader }
