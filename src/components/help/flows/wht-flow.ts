import { Position } from "@xyflow/react";
import type { HelpFlowDefinition } from "./types";

/**
 * Withholding tax lifecycle as a two-column snake: pay a vendor, withhold
 * at source, issue the 50 Tawi certificate, file PND 3/53 by the 7th, and
 * the vendor uses the certificate as a tax credit.
 */
export const WHT_FLOW: HelpFlowDefinition = {
  heightClass: "h-80",
  nodes: [
    {
      id: "pay",
      kind: "step",
      label: { en: "Pay vendor for services", th: "จ่ายค่าบริการให้ผู้ขาย" },
      x: 0,
      y: 0,
      sourcePosition: Position.Right,
    },
    {
      id: "withhold",
      kind: "action",
      label: { en: "Withhold tax at source", th: "หักภาษี ณ ที่จ่าย" },
      sublabel: { en: "3% services · 5% rent", th: "ค่าบริการ 3% · ค่าเช่า 5%" },
      x: 210,
      y: 0,
      targetPosition: Position.Left,
      sourcePosition: Position.Bottom,
    },
    {
      id: "tawi",
      kind: "action",
      label: { en: "Issue 50 Tawi certificate", th: "ออกหนังสือรับรอง 50 ทวิ" },
      x: 210,
      y: 120,
      targetPosition: Position.Top,
      sourcePosition: Position.Left,
    },
    {
      id: "file",
      kind: "action",
      label: { en: "File PND 3/53 by the 7th", th: "ยื่น ภ.ง.ด.3/53 ภายในวันที่ 7" },
      sublabel: { en: "15th via e-filing", th: "ยื่นออนไลน์ได้ถึงวันที่ 15" },
      x: 0,
      y: 120,
      targetPosition: Position.Right,
      sourcePosition: Position.Bottom,
    },
    {
      id: "credit",
      kind: "outcome",
      label: {
        en: "Vendor uses it as a tax credit",
        th: "ผู้ขายใช้เป็นเครดิตภาษี",
      },
      x: 0,
      y: 240,
      targetPosition: Position.Top,
    },
  ],
  edges: [
    { id: "e1", source: "pay", target: "withhold" },
    { id: "e2", source: "withhold", target: "tawi" },
    { id: "e3", source: "tawi", target: "file" },
    { id: "e4", source: "file", target: "credit" },
  ],
};
