"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { HelpFlowNodeKind } from "./types";

export type HelpFlowNodeData = {
  label: string;
  sublabel?: string;
  kind: HelpFlowNodeKind;
};

export type HelpFlowNodeType = Node<HelpFlowNodeData, "help">;

const KIND_CLASSES: Record<HelpFlowNodeKind, string> = {
  step: "border-border bg-card text-foreground",
  action: "border-primary/50 bg-accent text-accent-foreground",
  outcome: "border-border bg-muted text-foreground",
  note: "border-dashed border-border bg-background text-muted-foreground",
};

const HIDDEN_HANDLE_STYLE = { visibility: "hidden" } as const;

/**
 * Design-token styled node for help concept flows. Non-interactive; the
 * handles exist only so edges have anchor points and are visually hidden.
 */
export function HelpFlowNode({
  data,
  sourcePosition,
  targetPosition,
}: NodeProps<HelpFlowNodeType>) {
  return (
    <div
      className={cn(
        "w-40 rounded-md border px-3 py-2 text-center text-xs font-medium leading-snug shadow-xs",
        KIND_CLASSES[data.kind]
      )}
    >
      <div>{data.label}</div>
      {data.sublabel ? (
        <div className="mt-0.5 text-xs font-normal leading-snug text-muted-foreground">
          {data.sublabel}
        </div>
      ) : null}
      <Handle
        type="target"
        position={targetPosition ?? Position.Top}
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={sourcePosition ?? Position.Bottom}
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />
    </div>
  );
}
