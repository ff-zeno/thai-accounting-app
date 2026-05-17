export type ForeignWhtIncomeType =
  | "services"
  | "royalties"
  | "interest"
  | "dividends"
  | "rental"
  | "professional_fees"
  | "other";

export type ForeignWhtRateSource = "system_default" | "user_override";

export type ForeignWhtResolution = {
  isForeignPayee: boolean;
  formType: "pnd3" | "pnd53" | "pnd54";
  incomeType: ForeignWhtIncomeType;
  rdPaymentTypeCode: string;
  statutoryDefaultRate: string | null;
  selectedRate: string | null;
  rateSource: ForeignWhtRateSource;
  belowDefault: boolean;
  acknowledgmentRequired: boolean;
  blockingReasons: string[];
  sourceUrl: string | null;
  sourceRetrievedAt: string | null;
};

const RD_CIT_SOURCE_URL = "https://www.rd.go.th/english/6044.html";
const THAILAND_GO_SOURCE_URL = "https://www.thailand.go.th/useful-information-detail/006_130?hl=en";
const SOURCE_RETRIEVED_AT = "2026-05-16";

const STATUTORY_DEFAULTS: Record<
  ForeignWhtIncomeType,
  {
    rate: string;
    rdPaymentTypeCode: string;
    sourceUrl: string;
    sourceRetrievedAt: string;
  }
> = {
  dividends: {
    rate: "0.1000",
    rdPaymentTypeCode: "40(4)(b)",
    sourceUrl: RD_CIT_SOURCE_URL,
    sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  },
  interest: {
    rate: "0.1500",
    rdPaymentTypeCode: "40(4)(a)",
    sourceUrl: THAILAND_GO_SOURCE_URL,
    sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  },
  royalties: {
    rate: "0.1500",
    rdPaymentTypeCode: "40(3)",
    sourceUrl: THAILAND_GO_SOURCE_URL,
    sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  },
  rental: {
    rate: "0.1500",
    rdPaymentTypeCode: "40(5)",
    sourceUrl: THAILAND_GO_SOURCE_URL,
    sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  },
  professional_fees: {
    rate: "0.1500",
    rdPaymentTypeCode: "40(6)",
    sourceUrl: THAILAND_GO_SOURCE_URL,
    sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  },
  services: {
    rate: "0.1500",
    rdPaymentTypeCode: "40(8)",
    sourceUrl: RD_CIT_SOURCE_URL,
    sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  },
  other: {
    rate: "0.1500",
    rdPaymentTypeCode: "40(8)",
    sourceUrl: RD_CIT_SOURCE_URL,
    sourceRetrievedAt: SOURCE_RETRIEVED_AT,
  },
};

function normalizeRate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 0.3) return null;
  return num.toFixed(4);
}

function isForeignPayee(input: {
  vendorCountry?: string | null;
  vendorEntityType?: "individual" | "company" | "foreign" | string | null;
}) {
  return (
    input.vendorEntityType === "foreign" ||
    (input.vendorCountry ? input.vendorCountry.toUpperCase() !== "TH" : false)
  );
}

export function getForeignWhtStatutoryDefault(incomeType: ForeignWhtIncomeType) {
  return STATUTORY_DEFAULTS[incomeType];
}

export function resolveForeignWhtRate(input: {
  vendorCountry?: string | null;
  vendorEntityType?: "individual" | "company" | "foreign" | string | null;
  incomeType: ForeignWhtIncomeType;
  selectedRate?: string | number | null;
  acknowledgmentText?: string | null;
  accountantNote?: string | null;
}): ForeignWhtResolution {
  const foreign = isForeignPayee(input);
  const statutory = foreign ? getForeignWhtStatutoryDefault(input.incomeType) : null;
  const selectedRate = normalizeRate(input.selectedRate) ?? statutory?.rate ?? null;
  const statutoryDefaultRate = statutory?.rate ?? null;
  const rateSource: ForeignWhtRateSource =
    input.selectedRate === null || input.selectedRate === undefined || input.selectedRate === ""
      ? "system_default"
      : "user_override";
  const belowDefault = Boolean(
    foreign &&
      selectedRate &&
      statutoryDefaultRate &&
      Number(selectedRate) < Number(statutoryDefaultRate)
  );
  const acknowledgmentRequired = belowDefault;
  const blockingReasons: string[] = [];

  if (foreign && !selectedRate) {
    blockingReasons.push("Foreign WHT selected rate must be between 0% and 30%");
  }
  if (
    acknowledgmentRequired &&
    (!input.acknowledgmentText?.trim() || !input.accountantNote?.trim())
  ) {
    blockingReasons.push(
      "Below-default foreign WHT requires accountant advice and an owner acknowledgment"
    );
  }

  return {
    isForeignPayee: foreign,
    formType: foreign
      ? "pnd54"
      : input.vendorEntityType === "individual"
        ? "pnd3"
        : "pnd53",
    incomeType: input.incomeType,
    rdPaymentTypeCode: statutory?.rdPaymentTypeCode ?? "",
    statutoryDefaultRate,
    selectedRate,
    rateSource,
    belowDefault,
    acknowledgmentRequired,
    blockingReasons,
    sourceUrl: statutory?.sourceUrl ?? null,
    sourceRetrievedAt: statutory?.sourceRetrievedAt ?? null,
  };
}
