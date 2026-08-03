import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  humanizeStatus,
  statusVariant,
  STATUS_VARIANTS,
} from "@/lib/ui/status-registry"

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
  return (
    <Badge variant={statusVariant(normalized)} className={className}>
      {label ?? humanizeStatus(normalized)}
    </Badge>
  )
}

export { StatusBadge, STATUS_VARIANTS }
