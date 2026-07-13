import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/**
 * Canonical KPI tile: muted label, 24px/600 tabular-nums value, optional
 * hint line and icon. One size — value typography is not configurable so
 * every stat in the app reads identically.
 */
function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <Card size="sm" data-slot="stat-card" className={className}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon ? (
          <CardAction className="text-muted-foreground [&>svg]:size-4">
            {icon}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? (
          <p className={cn("mt-1 text-xs text-muted-foreground")}>{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export { StatCard }
