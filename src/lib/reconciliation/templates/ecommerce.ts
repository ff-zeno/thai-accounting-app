import type { RuleTemplate } from "./index";

export const ecommerceRules: RuleTemplate = {
  id: "ecommerce",
  name: "E-commerce / Marketplace",
  nameTh: "อีคอมเมิร์ซ / มาร์เก็ตเพลส",
  description: "Rules for e-commerce businesses: marketplace settlements, shipping, payment gateways",
  icon: "shopping-cart",
  rules: [
    {
      name: "Shopee settlement",
      description: "Shopee → Marketplace revenue",
      priority: 15,
      conditions: [
        { field: "counterparty", operator: "regex", value: "Shopee|ช้อปปี้" },
        { field: "type", operator: "equals", value: "credit" },
      ],
      actions: [
        { type: "assign_category", value: "marketplace_revenue" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Lazada settlement",
      description: "Lazada → Marketplace revenue",
      priority: 15,
      conditions: [
        { field: "counterparty", operator: "regex", value: "Lazada|ลาซาด้า" },
        { field: "type", operator: "equals", value: "credit" },
      ],
      actions: [
        { type: "assign_category", value: "marketplace_revenue" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Shipping: Thailand Post / Kerry / Flash",
      description: "Thai shipping providers → Shipping costs",
      priority: 20,
      conditions: [
        { field: "counterparty", operator: "regex", value: "Thailand\\s*Post|ไปรษณีย์|Kerry|เคอรี่|Flash\\s*Express|J&T|Ninja\\s*Van" },
      ],
      actions: [
        { type: "assign_category", value: "shipping" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Payment gateway (2C2P / Omise / Stripe)",
      description: "Payment processor → Payment gateway fees",
      priority: 20,
      conditions: [
        { field: "counterparty", operator: "regex", value: "2C2P|Omise|Stripe|PayPal|Opn\\s*Payments" },
      ],
      actions: [
        { type: "assign_category", value: "payment_gateway" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Packaging supplier",
      description: "Common packaging → Packaging materials",
      priority: 30,
      conditions: [
        { field: "counterparty", operator: "regex", value: "กล่อง|บรรจุภัณฑ์|packaging|PackPost" },
      ],
      actions: [
        { type: "assign_category", value: "packaging" },
        { type: "auto_match", value: "true" },
      ],
    },
  ],
};
