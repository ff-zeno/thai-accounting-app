export type ForeignVendorTaxWhtRoute = "pnd2" | "pnd3" | "pnd53" | "pnd54";

export interface ForeignVendorTaxDocumentLike {
  direction?: "expense" | "income" | string | null;
  vendorCountry?: string | null;
  vendorEntityType?: "individual" | "company" | "foreign" | string | null;
  category?: string | null;
  isPp36Subject?: boolean | null;
  paymentDate?: string | null;
  issueDate?: string | null;
  subtotal?: string | null;
  totalAmount?: string | null;
  totalAmountThb?: string | null;
  exchangeRate?: string | null;
  currency?: string | null;
}

export interface ForeignVendorTaxClassification {
  isForeignVendor: boolean;
  pp36Required: boolean;
  pp36ExcludedReason: "domestic_vendor" | "not_expense" | "goods_import" | null;
  whtFormRoute: ForeignVendorTaxWhtRoute | null;
  blockingReasons: string[];
  taxPointDate: string | null;
  thbBaseAvailable: boolean;
}

const PP36_CATEGORY_TOKENS = [
  "foreign_service",
  "foreign services",
  "service",
  "services",
  "online_ads",
  "advertising",
  "software",
  "saas",
  "royalty",
  "professional_fee",
  "professional fees",
  "consulting",
];

const GOODS_IMPORT_CATEGORY_TOKENS = [
  "goods_import",
  "import_goods",
  "inventory_import",
  "merchandise_import",
  "goods import",
];

export function normalizeIsoCountry(value: string | null | undefined) {
  const country = value?.trim().toUpperCase();
  return country && /^[A-Z]{2}$/.test(country) ? country : null;
}

export function isPp36ServiceCategory(category: string | null | undefined) {
  if (!category) return false;
  const normalized = category.toLowerCase();
  return PP36_CATEGORY_TOKENS.some((token) => normalized.includes(token));
}

export function isGoodsImportCategory(category: string | null | undefined) {
  if (!category) return false;
  const normalized = category.toLowerCase();
  return GOODS_IMPORT_CATEGORY_TOKENS.some((token) => normalized.includes(token));
}

export function classifyForeignVendorTax(
  doc: ForeignVendorTaxDocumentLike
): ForeignVendorTaxClassification {
  const vendorCountry = normalizeIsoCountry(doc.vendorCountry) ?? "TH";
  const entityType = doc.vendorEntityType ?? "company";
  const isForeignVendor = entityType === "foreign" || vendorCountry !== "TH";
  const isExpense = doc.direction === "expense";
  const goodsImport = isGoodsImportCategory(doc.category);
  const serviceMarked = Boolean(doc.isPp36Subject) || isPp36ServiceCategory(doc.category);
  const taxPointDate = doc.paymentDate ?? doc.issueDate ?? null;
  const currency = doc.currency?.trim().toUpperCase() || "THB";
  const thbBaseAvailable = Boolean(
    doc.totalAmountThb ||
      currency === "THB" ||
      (doc.totalAmount && doc.exchangeRate)
  );
  const blockingReasons: string[] = [];

  let pp36Required = false;
  let pp36ExcludedReason: ForeignVendorTaxClassification["pp36ExcludedReason"] = null;

  if (!isForeignVendor) {
    pp36ExcludedReason = "domestic_vendor";
  } else if (!isExpense) {
    pp36ExcludedReason = "not_expense";
  } else if (goodsImport) {
    pp36ExcludedReason = "goods_import";
  } else if (serviceMarked) {
    pp36Required = true;
    if (!taxPointDate) {
      blockingReasons.push("PP36 foreign service requires issue date or payment date");
    }
    if (!thbBaseAvailable) {
      blockingReasons.push(
        "PP36 foreign service requires reviewed THB base or exchange-rate snapshot"
      );
    }
  } else {
    blockingReasons.push(
      "foreign expense must be marked PP36 service/royalty/professional fee or categorized as goods import"
    );
  }

  return {
    isForeignVendor,
    pp36Required,
    pp36ExcludedReason,
    whtFormRoute: isForeignVendor
      ? "pnd54"
      : entityType === "individual"
        ? "pnd3"
        : "pnd53",
    blockingReasons,
    taxPointDate,
    thbBaseAvailable,
  };
}
