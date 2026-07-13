import * as React from "react"

import { cn } from "@/lib/utils"

const SIZES = {
  sm: "py-8",
  md: "py-12",
  lg: "py-16",
} as const

/**
 * Canonical empty state: optional icon, title, description, action — one
 * visual grammar for "nothing here yet" across the app.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        SIZES[size],
        className
      )}
    >
      {icon ? (
        <div className="text-muted-foreground [&>svg]:size-8">{icon}</div>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/** The "no organization selected" preset repeated on most pages. */
function NoOrgState({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <EmptyState
      size="lg"
      className={className}
      title="No organization selected"
      description={
        children ?? "Select an organization from the sidebar to get started."
      }
    />
  )
}

export { EmptyState, NoOrgState }
