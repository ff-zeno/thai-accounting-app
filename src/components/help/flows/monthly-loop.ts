import { Position } from "@xyflow/react";
import type { HelpFlowDefinition } from "./types";

/**
 * The app's core monthly loop, laid out as a two-column snake:
 * capture → AI extraction → human review → reconcile → file → close.
 */
export const MONTHLY_LOOP_FLOW: HelpFlowDefinition = {
  heightClass: "h-80",
  nodes: [
    {
      id: "capture",
      kind: "action",
      label: { en: "Capture / upload documents", th: "ถ่าย/อัปโหลดเอกสาร" },
      x: 0,
      y: 0,
      sourcePosition: Position.Right,
    },
    {
      id: "extract",
      kind: "step",
      label: { en: "AI reads the details", th: "AI อ่านข้อมูลให้" },
      x: 210,
      y: 0,
      targetPosition: Position.Left,
      sourcePosition: Position.Bottom,
    },
    {
      id: "review",
      kind: "action",
      label: { en: "You review & confirm", th: "คุณตรวจทานและยืนยัน" },
      x: 210,
      y: 110,
      targetPosition: Position.Top,
      sourcePosition: Position.Left,
    },
    {
      id: "reconcile",
      kind: "step",
      label: { en: "Reconcile with the bank", th: "กระทบยอดกับธนาคาร" },
      x: 0,
      y: 110,
      targetPosition: Position.Right,
      sourcePosition: Position.Bottom,
    },
    {
      id: "file",
      kind: "action",
      label: { en: "File VAT & WHT", th: "ยื่น ภ.พ.30 และ ภ.ง.ด." },
      x: 0,
      y: 220,
      targetPosition: Position.Top,
      sourcePosition: Position.Right,
    },
    {
      id: "close",
      kind: "outcome",
      label: { en: "Close the month", th: "ปิดงวดเดือน" },
      sublabel: { en: "then it repeats", th: "แล้วเริ่มเดือนใหม่" },
      x: 210,
      y: 220,
      targetPosition: Position.Left,
    },
  ],
  edges: [
    { id: "e1", source: "capture", target: "extract" },
    { id: "e2", source: "extract", target: "review" },
    { id: "e3", source: "review", target: "reconcile" },
    { id: "e4", source: "reconcile", target: "file" },
    { id: "e5", source: "file", target: "close" },
  ],
};
