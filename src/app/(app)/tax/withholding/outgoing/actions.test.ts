import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/utils/org-context", () => ({
  getVerifiedOrgId: vi.fn(),
}));

vi.mock("@/lib/utils/admin-guard", () => ({
  requireOrgAdmin: vi.fn(),
}));

vi.mock("@/lib/db/queries/organizations", () => ({
  getOrganizationById: vi.fn(),
}));

vi.mock("@/lib/db/queries/vendors", () => ({
  getVendorById: vi.fn(),
}));

vi.mock("@/lib/db/queries/wht-certificates", () => ({
  getCertificateWithItems: vi.fn(),
  getCertificatesByOrg: vi.fn(),
  reissueWhtCertificate: vi.fn(),
}));

vi.mock("@/lib/pdf/fifty-tawi", () => ({
  renderFiftyTawiPdf: vi.fn().mockResolvedValue(Buffer.from("pdf")),
}));

vi.mock("@/lib/pdf/fifty-tawi-bilingual", () => ({
  renderFiftyTawiBilingualPdf: vi.fn().mockResolvedValue(Buffer.from("pdf")),
  shouldRenderBilingualFiftyTawiPayee: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/storage", () => ({
  createStorage: vi.fn(),
}));

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

const { getVerifiedOrgId } = await import("@/lib/utils/org-context");
const { getOrganizationById } = await import("@/lib/db/queries/organizations");
const { getVendorById } = await import("@/lib/db/queries/vendors");
const { getCertificateWithItems } = await import(
  "@/lib/db/queries/wht-certificates"
);
const { renderFiftyTawiPdf } = await import("@/lib/pdf/fifty-tawi");
const {
  renderFiftyTawiBilingualPdf,
  shouldRenderBilingualFiftyTawiPayee,
} = await import("@/lib/pdf/fifty-tawi-bilingual");
const { createStorage } = await import("@/lib/storage");
const { generateCertificatePdfAction } = await import("./actions");

describe("WHT certificate actions", () => {
  const storageUploadMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    storageUploadMock.mockResolvedValue({ url: "https://blob.test/cert.pdf" });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    vi.mocked(createStorage).mockReturnValue({
      upload: storageUploadMock,
    } as unknown as ReturnType<typeof createStorage>);
  });

  it("renders PDF tax IDs and addresses from certificate snapshots", async () => {
    vi.mocked(getVerifiedOrgId).mockResolvedValue("org-1");
    vi.mocked(getCertificateWithItems).mockResolvedValue({
      id: "cert-1",
      orgId: "org-1",
      certificateNo: "PND53/2026/001",
      formType: "pnd53",
      payeeVendorId: "vendor-1",
      paymentDate: "2026-03-20",
      issuedDate: null,
      totalBaseAmount: "2000.00",
      totalWht: "60.00",
      payerTaxIdSnapshot: "1234567890123",
      payerAddressSnapshot: "Snapshot payer address",
      payeeAddressSnapshot: "Snapshot payee address",
      payeeIdNumberSnapshot: "3333333333333",
      items: [
        {
          whtType: "service",
          rdPaymentTypeCode: "402",
          baseAmount: "2000.00",
          whtRate: "0.0300",
          whtAmount: "60.00",
        },
      ],
    } as Awaited<ReturnType<typeof getCertificateWithItems>>);
    vi.mocked(getOrganizationById).mockResolvedValue({
      id: "org-1",
      name: "Live Org",
      nameTh: "องค์กรสด",
      taxId: "9999999999999",
      branchNumber: "00000",
      address: "Live payer address",
      addressTh: "Live payer address TH",
    } as Awaited<ReturnType<typeof getOrganizationById>>);
    vi.mocked(getVendorById).mockResolvedValue({
      id: "vendor-1",
      name: "Live Vendor",
      nameTh: "ผู้ขายสด",
      taxId: "8888888888888",
      branchNumber: "00000",
      country: "TH",
      entityType: "company",
      address: "Live payee address",
      addressTh: "Live payee address TH",
    } as Awaited<ReturnType<typeof getVendorById>>);

    await expect(generateCertificatePdfAction("cert-1")).resolves.toEqual({
      url: "https://blob.test/cert.pdf",
    });

    expect(renderFiftyTawiPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        payer: expect.objectContaining({
          taxId: "1234567890123",
          address: "Snapshot payer address",
          addressTh: "Snapshot payer address",
        }),
        payee: expect.objectContaining({
          taxId: "3333333333333",
          address: "Snapshot payee address",
          addressTh: "Snapshot payee address",
        }),
      })
    );
  });

  it("routes foreign payees to bilingual PDF generation and persists the uploaded URL", async () => {
    vi.mocked(getVerifiedOrgId).mockResolvedValue("org-1");
    vi.mocked(shouldRenderBilingualFiftyTawiPayee).mockReturnValue(true);
    vi.mocked(renderFiftyTawiBilingualPdf).mockResolvedValue(
      Buffer.from("foreign-pdf")
    );
    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    mockDbUpdate.mockReturnValue({ set: updateSetMock });
    vi.mocked(getCertificateWithItems).mockResolvedValue({
      id: "cert-foreign",
      orgId: "org-1",
      certificateNo: "PND54/2026/001",
      formType: "pnd54",
      payeeVendorId: "vendor-foreign",
      paymentDate: "2026-03-20",
      issuedDate: null,
      totalBaseAmount: "10000.00",
      totalWht: "1500.00",
      payerTaxIdSnapshot: "1234567890123",
      payerAddressSnapshot: "Snapshot payer address",
      payeeAddressSnapshot: "Foreign snapshot address",
      payeeIdNumberSnapshot: "SG-REG-001",
      items: [
        {
          whtType: "service",
          rdPaymentTypeCode: "402",
          baseAmount: "10000.00",
          whtRate: "0.1500",
          whtAmount: "1500.00",
        },
      ],
    } as Awaited<ReturnType<typeof getCertificateWithItems>>);
    vi.mocked(getOrganizationById).mockResolvedValue({
      id: "org-1",
      name: "Live Org",
      nameTh: "องค์กรสด",
      taxId: "9999999999999",
      branchNumber: "00000",
      address: "Live payer address",
      addressTh: "Live payer address TH",
    } as Awaited<ReturnType<typeof getOrganizationById>>);
    vi.mocked(getVendorById).mockResolvedValue({
      id: "vendor-foreign",
      name: "TikTok Pte Ltd",
      nameTh: null,
      taxId: null,
      branchNumber: null,
      country: "SG",
      entityType: "foreign",
      address: "1 Raffles Quay, Singapore",
      addressTh: null,
    } as Awaited<ReturnType<typeof getVendorById>>);

    await expect(generateCertificatePdfAction("cert-foreign")).resolves.toEqual({
      url: "https://blob.test/cert.pdf",
    });

    expect(shouldRenderBilingualFiftyTawiPayee).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "SG",
        entityType: "foreign",
      })
    );
    expect(renderFiftyTawiBilingualPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        certificateNo: "PND54/2026/001",
        formType: "pnd54",
        payee: expect.objectContaining({
          name: "TikTok Pte Ltd",
          taxId: "SG-REG-001",
          address: "Foreign snapshot address",
        }),
      })
    );
    expect(renderFiftyTawiPdf).not.toHaveBeenCalled();
    expect(storageUploadMock).toHaveBeenCalledWith(
      "wht-certificates/org-1/PND54-2026-001.pdf",
      Buffer.from("foreign-pdf"),
      "application/pdf"
    );
    expect(updateSetMock).toHaveBeenCalledWith({
      pdfUrl: "https://blob.test/cert.pdf",
    });
  });
});
