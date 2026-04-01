import type { RuleTemplate } from "./index";

export const commonRules: RuleTemplate = {
  id: "common",
  name: "Common Thai Business",
  nameTh: "ธุรกิจทั่วไป",
  description: "Rules for common Thai business transactions: tax payments, utilities, payroll, PromptPay",
  icon: "building-2",
  rules: [
    {
      name: "Revenue Department payment",
      description: "กรมสรรพากร (Revenue Department) → Tax payment",
      priority: 10,
      conditions: [
        { field: "counterparty", operator: "contains", value: "กรมสรรพากร" },
      ],
      actions: [
        { type: "assign_category", value: "tax_payment" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Social Security Office",
      description: "สำนักงานประกันสังคม → Social security contribution",
      priority: 10,
      conditions: [
        { field: "counterparty", operator: "contains", value: "ประกันสังคม" },
      ],
      actions: [
        { type: "assign_category", value: "social_security" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Metropolitan Electricity",
      description: "กฟน. (MEA) → Utilities",
      priority: 20,
      conditions: [
        { field: "counterparty", operator: "contains", value: "กฟน" },
      ],
      actions: [
        { type: "assign_category", value: "utilities" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Provincial Electricity",
      description: "กฟภ. (PEA) → Utilities",
      priority: 20,
      conditions: [
        { field: "counterparty", operator: "contains", value: "กฟภ" },
      ],
      actions: [
        { type: "assign_category", value: "utilities" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Waterworks",
      description: "ประปา → Utilities",
      priority: 20,
      conditions: [
        { field: "counterparty", operator: "contains", value: "ประปา" },
      ],
      actions: [
        { type: "assign_category", value: "utilities" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Salary payment",
      description: "เงินเดือน / Salary → Payroll",
      priority: 15,
      conditions: [
        { field: "description", operator: "regex", value: "เงินเดือน|salary|payroll" },
      ],
      actions: [
        { type: "assign_category", value: "payroll" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Small PromptPay (petty cash candidate)",
      description: "PromptPay + amount < 2000 → Mark as petty cash candidate",
      priority: 50,
      conditions: [
        { field: "channel", operator: "contains", value: "PromptPay" },
        { field: "amount", operator: "lt", value: 2000 },
      ],
      actions: [
        { type: "mark_petty_cash", value: "true" },
      ],
    },
    {
      name: "Internet/Telecom",
      description: "TRUE/AIS/DTAC/TOT/3BB/NT → Internet & telecom",
      priority: 25,
      conditions: [
        { field: "counterparty", operator: "regex", value: "TRUE|AIS|DTAC|TOT|3BB|NT\\b|ทรู|เอไอเอส" },
      ],
      actions: [
        { type: "assign_category", value: "telecom" },
        { type: "auto_match", value: "true" },
      ],
    },
  ],
};
