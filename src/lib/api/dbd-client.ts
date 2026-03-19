const DBD_API_BASE = "https://openapi.dbd.go.th/api/v1/juristic_person";
const TIMEOUT_MS = 10_000;

export interface DbdCompanyResult {
  taxId: string;
  nameTh: string;
  nameEn: string;
  entityType: string;
  registrationDate: string;
  status: string;
  capital: string;
  branchName: string;
  address: string;
}

/**
 * Validates that a tax ID is exactly 13 digits (Thai juristic person ID format).
 */
export function isValidTaxId(taxId: string): boolean {
  return /^\d{13}$/.test(taxId);
}

/**
 * Maps DBD branch name to the standard 5-digit branch number.
 * "สำนักงานใหญ่" (head office) → "00000"
 */
export function mapBranchNumber(branchName: string): string {
  if (branchName === "สำนักงานใหญ่") return "00000";
  // DBD sometimes returns "สาขาที่ 00001" or similar — extract digits if present
  const digits = branchName.replace(/\D/g, "");
  if (digits.length === 5) return digits;
  if (digits.length > 0) return digits.padStart(5, "0");
  return "00000";
}

/**
 * Formats the nested address object from the DBD API into a single string.
 */
function formatAddress(addr: Record<string, unknown> | undefined): string {
  if (!addr) return "";

  const parts = [
    addr["cd:OrganizationJuristicAddressNumber"],
    addr["cd:OrganizationJuristicAddressBuilding"],
    addr["cd:OrganizationJuristicAddressFloor"],
    addr["cd:OrganizationJuristicAddressVillageName"],
    addr["cd:OrganizationJuristicAddressMoo"],
    addr["cd:OrganizationJuristicAddressSoi"],
    addr["cd:OrganizationJuristicAddressRoad"],
    addr["cd:OrganizationJuristicAddressSubDistrict"],
    addr["cd:OrganizationJuristicAddressDistrict"],
    addr["cd:OrganizationJuristicAddressProvince"],
    addr["cd:OrganizationJuristicAddressPostCode"],
  ];

  return parts.filter((p) => p && String(p).trim()).join(" ");
}

/**
 * Converts DBD registration date format "YYYYMMDD" to "YYYY-MM-DD".
 */
function formatRegistrationDate(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/**
 * Looks up a company by 13-digit tax ID from the Thai DBD Open API.
 * Returns null on any error (network, timeout, not found, invalid input).
 */
export async function lookupCompany(
  taxId: string
): Promise<DbdCompanyResult | null> {
  if (!isValidTaxId(taxId)) {
    console.warn(`[dbd-client] Invalid tax ID format: ${taxId}`);
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${DBD_API_BASE}/${taxId}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(
        `[dbd-client] API returned ${response.status} for tax ID ${taxId}`
      );
      return null;
    }

    const json = await response.json();
    return parseDbdResponse(json);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn(`[dbd-client] Request timed out for tax ID ${taxId}`);
    } else {
      console.warn(`[dbd-client] Request failed for tax ID ${taxId}:`, error);
    }
    return null;
  }
}

/**
 * Parses the raw DBD API JSON response into our normalized format.
 * Exported for testing.
 */
export function parseDbdResponse(
  json: Record<string, unknown>
): DbdCompanyResult | null {
  try {
    const status = json.status as { code: string } | undefined;
    if (status?.code !== "1000") {
      console.warn(`[dbd-client] API status code: ${status?.code}`);
      return null;
    }

    const dataArray = json.data as Array<Record<string, unknown>> | undefined;
    if (!dataArray || dataArray.length === 0) return null;

    const company = dataArray[0][
      "cd:OrganizationJuristicPerson"
    ] as Record<string, unknown>;
    if (!company) return null;

    const branchName = String(
      company["cd:OrganizationJuristicBranchName"] ?? "สำนักงานใหญ่"
    );

    return {
      taxId: String(company["cd:OrganizationJuristicID"] ?? ""),
      nameTh: String(company["cd:OrganizationJuristicNameTH"] ?? ""),
      nameEn: String(company["cd:OrganizationJuristicNameEN"] ?? ""),
      entityType: String(company["cd:OrganizationJuristicType"] ?? ""),
      registrationDate: formatRegistrationDate(
        String(company["cd:OrganizationJuristicRegisterDate"] ?? "")
      ),
      status: String(company["cd:OrganizationJuristicStatus"] ?? ""),
      capital: String(company["cd:OrganizationJuristicRegisterCapital"] ?? ""),
      branchName,
      address: formatAddress(
        company["cd:OrganizationJuristicAddress"] as
          | Record<string, unknown>
          | undefined
      ),
    };
  } catch (error) {
    console.warn("[dbd-client] Failed to parse response:", error);
    return null;
  }
}
