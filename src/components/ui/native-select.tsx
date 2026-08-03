import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Styled native <select> for server-rendered forms (plain form POST /
 * searchParams filters) where the Base UI Select client component doesn't
 * apply. Visuals match the kit SelectTrigger. Client components with state
 * should use @/components/ui/select instead.
 *
 * The wrapper span owns sizing (h/w/text classes from `className` land here)
 * so the chevron can be a real icon instead of a data-URI background; the
 * inner select inherits font via preflight and fills the wrapper.
 */
function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <span
      data-slot="native-select"
      className={cn("relative inline-grid h-8 w-fit text-sm", className)}
    >
      <select
        className="col-start-1 row-start-1 size-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  )
}

export { NativeSelect }
