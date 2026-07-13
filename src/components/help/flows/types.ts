import type { Position } from "@xyflow/react";
import type { Localized } from "@/lib/help/content";

/**
 * Visual role of a node in a help flow:
 * - step: something the system does (neutral card)
 * - action: something YOU do (warm accent — the only decorated kind)
 * - outcome: an end state (muted)
 * - note: an aside/rule (dashed border, muted text)
 */
export type HelpFlowNodeKind = "step" | "action" | "outcome" | "note";

export interface HelpFlowNodeDef {
  id: string;
  kind: HelpFlowNodeKind;
  label: Localized;
  /** Optional second line, rendered smaller and muted. */
  sublabel?: Localized;
  x: number;
  y: number;
  sourcePosition?: Position;
  targetPosition?: Position;
}

export interface HelpFlowEdgeDef {
  id: string;
  source: string;
  target: string;
  label?: Localized;
  dashed?: boolean;
}

export interface HelpFlowDefinition {
  nodes: HelpFlowNodeDef[];
  edges: HelpFlowEdgeDef[];
  /** Tailwind height class for the flow container (flows differ in aspect). */
  heightClass: string;
}
