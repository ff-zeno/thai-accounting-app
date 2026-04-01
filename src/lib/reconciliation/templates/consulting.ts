import type { RuleTemplate } from "./index";

export const consultingRules: RuleTemplate = {
  id: "consulting",
  name: "Professional Services / Consulting",
  nameTh: "บริการที่ปรึกษา / วิชาชีพ",
  description: "Rules for consulting and professional service firms: retainer payments, quarterly tax, co-working",
  icon: "briefcase",
  rules: [
    {
      name: "Large monthly retainer (credit)",
      description: "Monthly credit > 50,000 THB → Retainer payment candidate",
      priority: 30,
      conditions: [
        { field: "type", operator: "equals", value: "credit" },
        { field: "amount", operator: "gt", value: 50000 },
      ],
      actions: [
        { type: "assign_category", value: "retainer_payment" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Co-working space",
      description: "Common co-working providers → Office rental",
      priority: 25,
      conditions: [
        { field: "counterparty", operator: "regex", value: "WeWork|JustCo|Regus|The\\s*Hive|HUBBA|True\\s*Digital\\s*Park" },
      ],
      actions: [
        { type: "assign_category", value: "office_rental" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Cloud services",
      description: "AWS/GCP/Azure/DigitalOcean → IT infrastructure",
      priority: 25,
      conditions: [
        { field: "counterparty", operator: "regex", value: "Amazon\\s*Web|AWS|Google\\s*Cloud|Microsoft\\s*Azure|DigitalOcean|Cloudflare" },
      ],
      actions: [
        { type: "assign_category", value: "it_infrastructure" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "SaaS subscriptions",
      description: "Common SaaS → Software subscriptions",
      priority: 25,
      conditions: [
        { field: "counterparty", operator: "regex", value: "Slack|Notion|GitHub|Figma|Zoom|Atlassian|Adobe" },
      ],
      actions: [
        { type: "assign_category", value: "software_subscription" },
        { type: "auto_match", value: "true" },
      ],
    },
  ],
};
