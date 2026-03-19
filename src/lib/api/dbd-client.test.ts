import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  lookupCompany,
  parseDbdResponse,
  isValidTaxId,
  mapBranchNumber,
} from "./dbd-client";

const VALID_RESPONSE = {
  status: { code: "1000", description: "Success" },
  data: [
    {
      "cd:OrganizationJuristicPerson": {
        "cd:OrganizationJuristicID": "0105537004444",
        "cd:OrganizationJuristicNameTH": "บริษัท ซิโนสยาม จำกัด",
        "cd:OrganizationJuristicNameEN": "SINO SIAM CO., LTD.",
        "cd:OrganizationJuristicType": "บริษัทจำกัด",
        "cd:OrganizationJuristicRegisterDate": "19940112",
        "cd:OrganizationJuristicStatus": "ยังดำเนินกิจการอยู่",
        "cd:OrganizationJuristicRegisterCapital": "1250000",
        "cd:OrganizationJuristicBranchName": "สำนักงานใหญ่",
        "cd:OrganizationJuristicAddress": {
          "cd:OrganizationJuristicAddressNumber": "123",
          "cd:OrganizationJuristicAddressRoad": "สุขุมวิท",
          "cd:OrganizationJuristicAddressSubDistrict": "คลองเตย",
          "cd:OrganizationJuristicAddressDistrict": "คลองเตย",
          "cd:OrganizationJuristicAddressProvince": "กรุงเทพมหานคร",
          "cd:OrganizationJuristicAddressPostCode": "10110",
        },
      },
    },
  ],
};

describe("isValidTaxId", () => {
  it("accepts exactly 13 digits", () => {
    expect(isValidTaxId("0105537004444")).toBe(true);
  });

  it("rejects 12-digit input", () => {
    expect(isValidTaxId("010553700444")).toBe(false);
  });

  it("rejects 14-digit input", () => {
    expect(isValidTaxId("01055370044441")).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(isValidTaxId("0105537004A44")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidTaxId("")).toBe(false);
  });

  it("rejects tax ID with dashes", () => {
    expect(isValidTaxId("0-1055-37004-444")).toBe(false);
  });
});

describe("mapBranchNumber", () => {
  it("maps head office to 00000", () => {
    expect(mapBranchNumber("สำนักงานใหญ่")).toBe("00000");
  });

  it("extracts 5-digit branch from text", () => {
    expect(mapBranchNumber("สาขาที่ 00001")).toBe("00001");
  });

  it("pads short branch numbers", () => {
    expect(mapBranchNumber("สาขา 3")).toBe("00003");
  });

  it("defaults to 00000 for unknown text", () => {
    expect(mapBranchNumber("unknown")).toBe("00000");
  });
});

describe("parseDbdResponse", () => {
  it("parses valid response correctly", () => {
    const result = parseDbdResponse(VALID_RESPONSE);
    expect(result).not.toBeNull();
    expect(result!.taxId).toBe("0105537004444");
    expect(result!.nameTh).toBe("บริษัท ซิโนสยาม จำกัด");
    expect(result!.nameEn).toBe("SINO SIAM CO., LTD.");
    expect(result!.entityType).toBe("บริษัทจำกัด");
    expect(result!.registrationDate).toBe("1994-01-12");
    expect(result!.status).toBe("ยังดำเนินกิจการอยู่");
    expect(result!.capital).toBe("1250000");
    expect(result!.branchName).toBe("สำนักงานใหญ่");
  });

  it("formats address from nested fields", () => {
    const result = parseDbdResponse(VALID_RESPONSE);
    expect(result!.address).toContain("123");
    expect(result!.address).toContain("สุขุมวิท");
    expect(result!.address).toContain("10110");
  });

  it("returns null for error status code", () => {
    const errorResponse = {
      status: { code: "2000", description: "Not Found" },
      data: [],
    };
    expect(parseDbdResponse(errorResponse)).toBeNull();
  });

  it("returns null for empty data array", () => {
    const emptyResponse = {
      status: { code: "1000", description: "Success" },
      data: [],
    };
    expect(parseDbdResponse(emptyResponse)).toBeNull();
  });

  it("returns null for missing juristic person key", () => {
    const badResponse = {
      status: { code: "1000", description: "Success" },
      data: [{ "some:OtherKey": {} }],
    };
    expect(parseDbdResponse(badResponse)).toBeNull();
  });

  it("handles missing address gracefully", () => {
    const noAddress = structuredClone(VALID_RESPONSE);
    delete (
      noAddress.data[0]["cd:OrganizationJuristicPerson"] as Record<
        string,
        unknown
      >
    )["cd:OrganizationJuristicAddress"];
    const result = parseDbdResponse(noAddress);
    expect(result).not.toBeNull();
    expect(result!.address).toBe("");
  });
});

describe("lookupCompany", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns parsed data for valid tax ID", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(VALID_RESPONSE),
    });

    const result = await lookupCompany("0105537004444");
    expect(result).not.toBeNull();
    expect(result!.taxId).toBe("0105537004444");
    expect(result!.nameEn).toBe("SINO SIAM CO., LTD.");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://openapi.dbd.go.th/api/v1/juristic_person/0105537004444",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      })
    );
  });

  it("returns null for invalid tax ID without calling API", async () => {
    globalThis.fetch = vi.fn();
    const result = await lookupCompany("123456789012");
    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns null on HTTP 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await lookupCompany("0105537004444");
    expect(result).toBeNull();
  });

  it("returns null on HTTP 500", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await lookupCompany("0105537004444");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await lookupCompany("0105537004444");
    expect(result).toBeNull();
  });

  it("returns null on timeout (AbortError)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError")
    );

    const result = await lookupCompany("0105537004444");
    expect(result).toBeNull();
  });

  it("returns null for non-13-digit tax ID", async () => {
    globalThis.fetch = vi.fn();

    // 12 digits
    expect(await lookupCompany("010553700444")).toBeNull();
    // 14 digits
    expect(await lookupCompany("01055370044441")).toBeNull();
    // Letters
    expect(await lookupCompany("ABCDEFGHIJKLM")).toBeNull();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
