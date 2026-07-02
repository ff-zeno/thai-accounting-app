"use client";

import "@xyflow/react/dist/style.css";

import { MarkerType, ReactFlow, type Edge } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { FlowId, HelpLang } from "@/lib/help/content";
import { HelpFlowNode, type HelpFlowNodeType } from "./flow-node";
import { MONTHLY_LOOP_FLOW } from "./monthly-loop";
import { VAT_FLOW } from "./vat-flow";
import { WHT_FLOW } from "./wht-flow";
import type { HelpFlowDefinition } from "./types";

const FLOWS: Record<FlowId, HelpFlowDefinition> = {
  "monthly-loop": MONTHLY_LOOP_FLOW,
  "vat-flow": VAT_FLOW,
  "wht-flow": WHT_FLOW,
};

// Stable references — React Flow warns when these are recreated per render.
const NODE_TYPES = { help: HelpFlowNode };
const FIT_VIEW_OPTIONS = { padding: 0.08 };
const PRO_OPTIONS = { hideAttribution: true };

const EDGE_STROKE = "var(--muted-foreground)";

interface FlowViewerProps {
  flowId: FlowId;
  lang: HelpLang;
}

/**
 * Renders one of the static help concept flows. Loaded via next/dynamic
 * (ssr: false) so React Flow and its stylesheet only ship when the help
 * sidebar actually shows a diagram.
 */
export default function FlowViewer({ flowId, lang }: FlowViewerProps) {
  const definition = FLOWS[flowId];

  const nodes: HelpFlowNodeType[] = definition.nodes.map((node) => ({
    id: node.id,
    type: "help",
    position: { x: node.x, y: node.y },
    data: {
      label: node.label[lang],
      sublabel: node.sublabel?.[lang],
      kind: node.kind,
    },
    sourcePosition: node.sourcePosition,
    targetPosition: node.targetPosition,
    draggable: false,
    selectable: false,
    connectable: false,
  }));

  const edges: Edge[] = definition.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    label: edge.label?.[lang],
    labelStyle: { fontSize: 12, fill: "var(--muted-foreground)" },
    labelBgStyle: { fill: "var(--background)", fillOpacity: 0.85 },
    style: {
      stroke: EDGE_STROKE,
      strokeWidth: 1.2,
      ...(edge.dashed ? { strokeDasharray: "4 3" } : {}),
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: EDGE_STROKE,
      width: 16,
      height: 16,
    },
  }));

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg border bg-muted/20",
        definition.heightClass
      )}
    >
      <ReactFlow
        // Remount on language switch so fitView re-measures the relabeled nodes.
        key={`${flowId}-${lang}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.3}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnDrag
        preventScrolling={false}
        proOptions={PRO_OPTIONS}
      />
    </div>
  );
}
