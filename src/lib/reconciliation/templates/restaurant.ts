import type { RuleTemplate } from "./index";

export const restaurantRules: RuleTemplate = {
  id: "restaurant",
  name: "Restaurant / F&B",
  nameTh: "ร้านอาหาร / อาหารและเครื่องดื่ม",
  description: "Rules for restaurant and food service businesses: wholesale suppliers, POS deposits, delivery platforms",
  icon: "utensils",
  rules: [
    {
      name: "Makro wholesale",
      description: "Makro → Food supplies",
      priority: 20,
      conditions: [
        { field: "counterparty", operator: "regex", value: "Makro|แม็คโคร|สยามแม็คโคร" },
      ],
      actions: [
        { type: "assign_category", value: "food_supplies" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Tops / Central Food Retail",
      description: "Tops → Food supplies",
      priority: 20,
      conditions: [
        { field: "counterparty", operator: "regex", value: "Tops|ท็อปส์|Central Food" },
      ],
      actions: [
        { type: "assign_category", value: "food_supplies" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Big C wholesale",
      description: "Big C → Food supplies",
      priority: 20,
      conditions: [
        { field: "counterparty", operator: "regex", value: "Big\\s*C|บิ๊กซี" },
      ],
      actions: [
        { type: "assign_category", value: "food_supplies" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Grab/LINE MAN/Robinhood settlement",
      description: "Food delivery platform → Revenue deposits",
      priority: 15,
      conditions: [
        { field: "counterparty", operator: "regex", value: "Grab|LINE\\s*MAN|Robinhood|Food\\s*Panda" },
        { field: "type", operator: "equals", value: "credit" },
      ],
      actions: [
        { type: "assign_category", value: "platform_revenue" },
        { type: "auto_match", value: "true" },
      ],
    },
    {
      name: "Gas/LPG supplier",
      description: "Gas supplier → Kitchen supplies",
      priority: 25,
      conditions: [
        { field: "counterparty", operator: "regex", value: "ปตท|PTT|แก๊ส|LPG|Siam Gas" },
      ],
      actions: [
        { type: "assign_category", value: "kitchen_supplies" },
        { type: "auto_match", value: "true" },
      ],
    },
  ],
};
