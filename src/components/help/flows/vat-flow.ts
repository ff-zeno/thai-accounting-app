import { Position } from "@xyflow/react";
import type { HelpFlowDefinition } from "./types";

/**
 * PP 30 offset concept: output VAT (sales) and input VAT (purchases) meet
 * in the monthly PP 30, which ends in either a payment or a carried credit.
 * PP 36 sits in a separate lane below — it never feeds the same month's
 * PP 30 input; only after remittance does it become a later month's input.
 */
export const VAT_FLOW: HelpFlowDefinition = {
  heightClass: "h-[26rem]",
  nodes: [
    {
      id: "sales",
      kind: "step",
      label: { en: "Sales", th: "ขาย" },
      sublabel: { en: "output VAT collected", th: "เก็บภาษีขายจากลูกค้า" },
      x: 0,
      y: 0,
      sourcePosition: Position.Bottom,
    },
    {
      id: "purchases",
      kind: "step",
      label: { en: "Purchases", th: "ซื้อ" },
      sublabel: { en: "input VAT paid", th: "จ่ายภาษีซื้อให้ผู้ขาย" },
      x: 210,
      y: 0,
      sourcePosition: Position.Bottom,
    },
    {
      id: "pp30",
      kind: "action",
      label: { en: "PP 30 offset", th: "หักกลบใน ภ.พ.30" },
      sublabel: { en: "output − input, every month", th: "ภาษีขาย − ภาษีซื้อ ทุกเดือน" },
      x: 105,
      y: 120,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    },
    {
      id: "pay",
      kind: "outcome",
      label: { en: "Pay difference to RD", th: "จ่ายส่วนต่างให้สรรพากร" },
      x: 0,
      y: 250,
      targetPosition: Position.Top,
    },
    {
      id: "credit",
      kind: "outcome",
      label: { en: "Carry credit forward", th: "ยกเครดิตไปเดือนถัดไป" },
      x: 210,
      y: 250,
      targetPosition: Position.Top,
    },
    {
      id: "pp36",
      kind: "note",
      label: { en: "PP 36 — foreign services", th: "ภ.พ.36 — บริการต่างประเทศ" },
      sublabel: { en: "separate form, own payment", th: "แบบแยก ชำระต่างหาก" },
      x: 0,
      y: 380,
      sourcePosition: Position.Right,
    },
    {
      id: "pp36-next",
      kind: "note",
      label: { en: "Next month's input VAT", th: "เป็นภาษีซื้อของเดือนถัดไป" },
      sublabel: {
        en: "only after remitting — never this month's PP 30",
        th: "หลังนำส่งเงินแล้วเท่านั้น ห้ามรวมใน ภ.พ.30 เดือนนี้",
      },
      x: 210,
      y: 380,
      targetPosition: Position.Left,
    },
  ],
  edges: [
    { id: "e1", source: "sales", target: "pp30" },
    { id: "e2", source: "purchases", target: "pp30" },
    {
      id: "e3",
      source: "pp30",
      target: "pay",
      label: { en: "output larger", th: "ภาษีขายมากกว่า" },
    },
    {
      id: "e4",
      source: "pp30",
      target: "credit",
      label: { en: "input larger", th: "ภาษีซื้อมากกว่า" },
    },
    { id: "e5", source: "pp36", target: "pp36-next", dashed: true },
  ],
};
