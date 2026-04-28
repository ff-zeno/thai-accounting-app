/**
 * Canonical document/vendor category list (bilingual EN/TH).
 *
 * Stored in DB as the English string (`value`). Rendered per locale by UI.
 * New categories entered by users are persisted as free-form strings — this
 * list is just the curated starter set shown in the autocomplete dropdown.
 */

export interface DocumentCategory {
  /** Stored in DB. English, lowercase, short. */
  value: string;
  /** Displayed in UI when locale === 'en'. */
  labelEn: string;
  /** Displayed in UI when locale === 'th'. */
  labelTh: string;
  /** Extra search terms, EN + TH, that make typeahead forgiving. */
  aliases?: string[];
}

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  // Professional & business services
  { value: "Accounting", labelEn: "Accounting", labelTh: "บัญชี", aliases: ["bookkeeping", "audit", "tax preparation"] },
  { value: "Legal", labelEn: "Legal", labelTh: "กฎหมาย", aliases: ["lawyer", "attorney", "ทนาย"] },
  { value: "Consulting", labelEn: "Consulting", labelTh: "ที่ปรึกษา", aliases: ["advisory"] },
  { value: "Professional Services", labelEn: "Professional Services", labelTh: "บริการวิชาชีพ" },

  // Marketing & advertising
  { value: "Advertising", labelEn: "Advertising", labelTh: "โฆษณา", aliases: ["ads", "marketing"] },
  { value: "Marketing", labelEn: "Marketing", labelTh: "การตลาด" },
  { value: "Social Media", labelEn: "Social Media", labelTh: "โซเชียลมีเดีย", aliases: ["facebook", "instagram", "tiktok"] },
  { value: "SEO", labelEn: "SEO / Digital Marketing", labelTh: "SEO / การตลาดดิจิทัล" },

  // Software & technology
  { value: "Software Subscription", labelEn: "Software Subscription", labelTh: "ค่าสมัครซอฟต์แวร์", aliases: ["saas", "subscription", "license"] },
  { value: "Cloud Hosting", labelEn: "Cloud Hosting", labelTh: "โฮสติ้งคลาวด์", aliases: ["aws", "google cloud", "azure", "vercel"] },
  { value: "Domain", labelEn: "Domain & Hosting", labelTh: "โดเมนและโฮสติ้ง" },
  { value: "IT Services", labelEn: "IT Services", labelTh: "บริการไอที" },
  { value: "Equipment", labelEn: "Equipment / Hardware", labelTh: "อุปกรณ์ / ฮาร์ดแวร์" },
  { value: "Office Supplies", labelEn: "Office Supplies", labelTh: "เครื่องเขียน / ของใช้สำนักงาน", aliases: ["stationery"] },

  // Payment processing & finance
  { value: "Merchant Processor", labelEn: "Merchant Processor", labelTh: "ผู้ให้บริการรับชำระ", aliases: ["ksher", "payment gateway", "stripe", "paypal", "2c2p"] },
  { value: "Bank Fees", labelEn: "Bank Fees", labelTh: "ค่าธรรมเนียมธนาคาร" },
  { value: "Foreign Exchange", labelEn: "Foreign Exchange", labelTh: "ค่าธรรมเนียมแลกเงิน", aliases: ["fx", "forex"] },
  { value: "Interest Expense", labelEn: "Interest Expense", labelTh: "ดอกเบี้ยจ่าย" },
  { value: "Interest Income", labelEn: "Interest Income", labelTh: "ดอกเบี้ยรับ" },
  { value: "Financial Services", labelEn: "Financial Services", labelTh: "บริการทางการเงิน" },

  // Staff & HR
  { value: "Salary", labelEn: "Salary / Payroll", labelTh: "เงินเดือน / ค่าจ้าง", aliases: ["wages"] },
  { value: "Contractor", labelEn: "Contractor / Freelancer", labelTh: "ผู้รับเหมา / ฟรีแลนซ์" },
  { value: "Employee Benefits", labelEn: "Employee Benefits", labelTh: "สวัสดิการพนักงาน" },
  { value: "Social Security", labelEn: "Social Security", labelTh: "ประกันสังคม" },
  { value: "Training", labelEn: "Training & Development", labelTh: "ฝึกอบรมและพัฒนา" },

  // Travel & transportation
  { value: "Travel", labelEn: "Travel", labelTh: "เดินทาง", aliases: ["flight", "hotel", "airbnb"] },
  { value: "Transportation", labelEn: "Transportation", labelTh: "ค่าขนส่ง / ค่าเดินทางในประเทศ", aliases: ["taxi", "grab", "bolt"] },
  { value: "Fuel", labelEn: "Fuel / Petrol", labelTh: "ค่าน้ำมัน" },
  { value: "Vehicle", labelEn: "Vehicle Expenses", labelTh: "ค่าใช้จ่ายยานพาหนะ" },
  { value: "Shipping", labelEn: "Shipping & Courier", labelTh: "ขนส่ง / พัสดุ", aliases: ["fedex", "dhl", "kerry", "flash", "thailand post"] },

  // Office & facilities
  { value: "Rent", labelEn: "Rent / Lease", labelTh: "ค่าเช่า" },
  { value: "Utilities", labelEn: "Utilities", labelTh: "ค่าสาธารณูปโภค", aliases: ["electricity", "water"] },
  { value: "Electricity", labelEn: "Electricity", labelTh: "ค่าไฟ" },
  { value: "Water", labelEn: "Water", labelTh: "ค่าน้ำ" },
  { value: "Internet", labelEn: "Internet / Phone", labelTh: "อินเทอร์เน็ต / โทรศัพท์", aliases: ["true", "ais", "dtac", "3bb"] },
  { value: "Cleaning", labelEn: "Cleaning & Maintenance", labelTh: "ทำความสะอาด / ซ่อมบำรุง" },
  { value: "Security", labelEn: "Security", labelTh: "รักษาความปลอดภัย" },

  // Sales & COGS
  { value: "Inventory", labelEn: "Inventory / Goods for Resale", labelTh: "สินค้าคงคลัง / สินค้าเพื่อขาย" },
  { value: "Raw Materials", labelEn: "Raw Materials", labelTh: "วัตถุดิบ" },
  { value: "Packaging", labelEn: "Packaging", labelTh: "บรรจุภัณฑ์" },
  { value: "Commission", labelEn: "Sales Commission", labelTh: "ค่านายหน้า" },

  // Food & entertainment
  { value: "Meals & Entertainment", labelEn: "Meals & Entertainment", labelTh: "ค่ารับรอง / ค่าอาหาร", aliases: ["food", "restaurant", "รับรอง"] },
  { value: "Office Snacks", labelEn: "Office Snacks", labelTh: "ของว่างในสำนักงาน" },

  // Insurance & compliance
  { value: "Insurance", labelEn: "Insurance", labelTh: "ประกันภัย" },
  { value: "Government Fees", labelEn: "Government Fees", labelTh: "ค่าธรรมเนียมราชการ", aliases: ["license", "permit"] },
  { value: "Tax", labelEn: "Tax Payments", labelTh: "ภาษี" },

  // Revenue (income docs)
  { value: "Product Sales", labelEn: "Product Sales", labelTh: "รายได้จากการขายสินค้า" },
  { value: "Service Revenue", labelEn: "Service Revenue", labelTh: "รายได้ค่าบริการ" },
  { value: "Consulting Revenue", labelEn: "Consulting Revenue", labelTh: "รายได้ค่าที่ปรึกษา" },
  { value: "Subscription Revenue", labelEn: "Subscription Revenue", labelTh: "รายได้จากการสมัครสมาชิก" },
  { value: "Refund", labelEn: "Refund / Return", labelTh: "เงินคืน / สินค้าคืน" },

  // Catch-all
  { value: "Other", labelEn: "Other", labelTh: "อื่นๆ" },
];

/**
 * Get the label for the active locale. Falls back to English.
 */
export function getCategoryLabel(
  category: DocumentCategory,
  locale: string
): string {
  return locale === "th" ? category.labelTh : category.labelEn;
}

/**
 * Look up a canonical category by its stored value.
 */
export function findCategoryByValue(
  value: string
): DocumentCategory | undefined {
  return DOCUMENT_CATEGORIES.find((c) => c.value === value);
}

/**
 * Label that should appear in the input for a given stored value.
 * Free-form user input (not in the canonical list) shows as-is.
 */
export function displayLabelForValue(value: string, locale: string): string {
  const match = findCategoryByValue(value);
  if (!match) return value;
  return getCategoryLabel(match, locale);
}
