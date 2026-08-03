import * as React from "react"

import { cn } from "@/lib/utils"
import { Amount } from "@/components/ui/amount"

/**
 * Settlement-math strip (DESIGN.md): a horizontal chain of money steps joined
 * by −/+/= operators, each value rendered through Amount. The `equals` step is
 * the result (e.g. net-to-bank) and gets the brand-soft tinted emphasis.
 */
type FlowStripStep = {
  label: React.ReactNode
  value: string | number | null | undefined
  /** Operator rendered before this step; the first step omits it. */
  op?: "minus" | "plus" | "equals"
  hint?: React.ReactNode
}

const OP_GLYPHS = { minus: "−", plus: "+", equals: "=" } as const

function FlowStrip({
  steps,
  className,
}: {
  steps: FlowStripStep[]
  className?: string
}) {
  return (
    <div
      data-slot="flow-strip"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}
    >
      {steps.map((step, index) => (
        <React.Fragment key={index}>
          {step.op ? (
            <span aria-hidden="true" className="text-lg text-muted-foreground">
              {OP_GLYPHS[step.op]}
            </span>
          ) : null}
          <div
            className={cn(
              "rounded-lg px-3 py-2",
              step.op === "equals" ? "bg-accent" : "bg-muted/50"
            )}
          >
            <div className="text-xs text-muted-foreground">{step.label}</div>
            <Amount
              value={step.value}
              className={cn(
                "text-sm",
                step.op === "equals" ? "font-semibold" : "font-medium"
              )}
            />
            {step.hint ? (
              <div className="text-xs text-muted-foreground">{step.hint}</div>
            ) : null}
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

export { FlowStrip }
export type { FlowStripStep }
