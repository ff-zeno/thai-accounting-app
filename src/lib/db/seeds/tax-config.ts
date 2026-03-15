import type { Database } from "../index";
import { taxConfig } from "../schema";

export const taxConfigSeedData = [
  {
    key: "vat_rate",
    value: "0.07",
    description: "Standard VAT rate (7%), valid through Sep 2026",
    effectiveFrom: "2024-01-01",
    effectiveTo: "2026-09-30",
  },
  {
    key: "efiling_extension_days",
    value: "8",
    description: "Extra days granted for e-filing (valid through Jan 2027)",
    effectiveFrom: "2024-01-01",
    effectiveTo: "2027-01-31",
  },
  {
    key: "wht_paper_deadline_day",
    value: "7",
    description: "Day of month for WHT paper filing deadline (7th of following month)",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
  {
    key: "wht_efiling_deadline_day",
    value: "15",
    description: "Day of month for WHT e-filing deadline (15th of following month)",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
  {
    key: "pp30_efiling_deadline_day",
    value: "23",
    description: "Day of month for PP 30 VAT e-filing deadline (23rd of following month)",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
  {
    key: "pp36_deadline_day",
    value: "15",
    description: "Day of month for PP 36 reverse-charge VAT deadline (15th, no extension)",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
  },
];

export async function seedTaxConfig(db: Database) {
  console.log("Seeding tax config...");
  await db.insert(taxConfig).values(taxConfigSeedData).onConflictDoNothing();
  console.log(`Seeded ${taxConfigSeedData.length} tax config entries.`);
}
