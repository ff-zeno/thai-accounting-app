import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/utils/admin-guard", () => ({
  requireOrgAdmin: vi.fn(),
}));

vi.mock("@/lib/utils/org-context", () => ({
  getVerifiedOrgId: vi.fn(),
}));

vi.mock("@/lib/db/queries/vat-operations-ledger", () => ({
  buildPp30VatFilingDraft: vi.fn(),
  buildPp36VatFilingDraft: vi.fn(),
  getVatFilingDrilldown: vi.fn(),
  getVatForecastByPeriodRange: vi.fn(),
  getVatLedgerPeriodDashboard: vi.fn(),
  getVatLedgerRegister: vi.fn(),
  markVatFilingDraftFiled: vi.fn(),
  recordPp36FilingPayment: vi.fn(),
}));

const { revalidatePath } = await import("next/cache");
const { getVerifiedOrgId } = await import("@/lib/utils/org-context");
const { requireOrgAdmin } = await import("@/lib/utils/admin-guard");
const {
  buildPp30VatFilingDraft,
  buildPp36VatFilingDraft,
  getVatFilingDrilldown,
  getVatForecastByPeriodRange,
  getVatLedgerPeriodDashboard,
  getVatLedgerRegister,
  markVatFilingDraftFiled,
  recordPp36FilingPayment,
} = await import(
  "@/lib/db/queries/vat-operations-ledger"
);
const {
  buildPp30VatLedgerDraftAction,
  buildPp36VatLedgerDraftAction,
  fileVatLedgerDraftAction,
  loadVatDataAction,
  loadVatFilingDrilldownAction,
  loadVatForecastAction,
  loadVatRegisterAction,
  recordPp36VatLedgerPaymentAction,
} = await import("./actions");

const adminContext = {
  orgId: "95aead7c-9942-474f-b48e-2ec5b46f10c9",
  userId: "b44b0b31-e293-4c2b-99b0-19f596f30c55",
  role: "admin",
} as const;

describe("VAT actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the ledger period dashboard without legacy VAT rollup dependencies", async () => {
    vi.mocked(getVerifiedOrgId).mockResolvedValue(
      "95aead7c-9942-474f-b48e-2ec5b46f10c9"
    );
    vi.mocked(getVatLedgerPeriodDashboard).mockResolvedValue({
      period: { year: 2026, month: 3 },
      pp30: {
        filingId: null,
        status: "not_built",
        paymentStatus: "not_required",
        deadline: "2026-04-23",
        outputVatTotal: "140.00",
        inputVatTotal: "70.00",
        pp36ReclaimTotal: "0.00",
        carryforwardIn: "0.00",
        carryforwardOut: "0.00",
        netPayable: "70.00",
        refundable: "0.00",
        signedNetPosition: "70.00",
        nilFilingRequired: false,
      },
      pp36: {
        filingId: null,
        status: "not_built",
        paymentStatus: "not_required",
        deadline: "2026-04-15",
        pp36VatTotal: "0.00",
        paidAt: null,
        rdReceiptNo: null,
      },
      inputItems: [],
      outputItems: [],
      pp36Items: [],
      exceptions: [],
      warnings: {
        expiringInputVat: { count: 0, vatAmount: "0.00" },
        pp36ReclaimQueue: { count: 0, vatAmount: "0.00" },
        availableCarryforward: { count: 0, amount: "0.00" },
      },
    });

    await expect(loadVatDataAction(2026, 3)).resolves.toMatchObject({
      success: true,
      dashboard: {
        period: { year: 2026, month: 3 },
        pp30: { netPayable: "70.00" },
      },
    });

    expect(getVatLedgerPeriodDashboard).toHaveBeenCalledWith({
      orgId: "95aead7c-9942-474f-b48e-2ec5b46f10c9",
      periodYear: 2026,
      periodMonth: 3,
    });
  });

  it("loads ledger register, drilldown, and forecast read models", async () => {
    vi.mocked(getVerifiedOrgId).mockResolvedValue(
      "95aead7c-9942-474f-b48e-2ec5b46f10c9"
    );
    vi.mocked(getVatLedgerRegister).mockResolvedValue({
      inputRegister: [],
      outputRegister: [],
      inputTotal: "0.00",
      outputTotal: "0.00",
    });
    vi.mocked(getVatFilingDrilldown).mockResolvedValue({
      filing: { id: "11111111-1111-4111-8111-111111111111" },
      lines: [],
      grouped: {},
      totalsByType: {},
      reconciles: {
        output: true,
        input: true,
        pp36: true,
        pp36Reclaim: true,
        carryforward: true,
      },
    } as unknown as Awaited<ReturnType<typeof getVatFilingDrilldown>>);
    vi.mocked(getVatForecastByPeriodRange).mockResolvedValue([]);

    await expect(loadVatRegisterAction(2026, 3)).resolves.toEqual({
      success: true,
      register: {
        inputRegister: [],
        outputRegister: [],
        inputTotal: "0.00",
        outputTotal: "0.00",
      },
    });
    await expect(
      loadVatFilingDrilldownAction("11111111-1111-4111-8111-111111111111")
    ).resolves.toMatchObject({ success: true });
    await expect(loadVatForecastAction(2026, 3)).resolves.toEqual({
      success: true,
      forecast: [],
    });
  });

  it("builds a scoped PP30 VAT ledger draft for authorized org admins", async () => {
    vi.mocked(requireOrgAdmin).mockResolvedValue(adminContext);
    vi.mocked(buildPp30VatFilingDraft).mockResolvedValue({
      filing: {
        id: "11111111-1111-4111-8111-111111111111",
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        status: "draft",
        outputVatTotal: "140.00",
        inputVatTotal: "70.00",
        pp36ReclaimTotal: "0.00",
        carryforwardIn: "0.00",
      },
      output: { allocatedCount: 2 },
      input: { allocatedCount: 1 },
      pp36Reclaim: { allocatedCount: 0 },
      carryforward: { allocatedCount: 0 },
    } as Awaited<ReturnType<typeof buildPp30VatFilingDraft>>);

    await expect(buildPp30VatLedgerDraftAction(2026, 3)).resolves.toEqual({
      success: true,
      filing: {
        id: "11111111-1111-4111-8111-111111111111",
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        status: "draft",
        outputVatTotal: "140.00",
        inputVatTotal: "70.00",
        pp36ReclaimTotal: "0.00",
        carryforwardIn: "0.00",
      },
      allocatedCounts: {
        output: 2,
        input: 1,
        pp36Reclaim: 0,
        carryforward: 0,
      },
    });

    expect(buildPp30VatFilingDraft).toHaveBeenCalledWith({
      orgId: "95aead7c-9942-474f-b48e-2ec5b46f10c9",
      periodYear: 2026,
      periodMonth: 3,
      actorId: "b44b0b31-e293-4c2b-99b0-19f596f30c55",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tax/vat");
  });

  it("authorizes but does not build PP30 VAT ledger drafts for invalid periods", async () => {
    vi.mocked(requireOrgAdmin).mockResolvedValue(adminContext);

    await expect(buildPp30VatLedgerDraftAction(2026, 13)).resolves.toEqual({
      error: "Month must be between 1 and 12",
    });

    expect(requireOrgAdmin).toHaveBeenCalled();
    expect(buildPp30VatFilingDraft).not.toHaveBeenCalled();
  });

  it("builds a scoped PP36 VAT ledger draft for authorized org admins", async () => {
    vi.mocked(requireOrgAdmin).mockResolvedValue(adminContext);
    vi.mocked(buildPp36VatFilingDraft).mockResolvedValue({
      filing: {
        id: "22222222-2222-4222-8222-222222222222",
        filingType: "pp36",
        periodYear: 2026,
        periodMonth: 3,
        status: "draft",
        pp36VatTotal: "70.00",
      },
      obligations: { allocatedCount: 1 },
    } as Awaited<ReturnType<typeof buildPp36VatFilingDraft>>);

    await expect(buildPp36VatLedgerDraftAction(2026, 3)).resolves.toEqual({
      success: true,
      filing: {
        id: "22222222-2222-4222-8222-222222222222",
        filingType: "pp36",
        periodYear: 2026,
        periodMonth: 3,
        status: "draft",
        pp36VatTotal: "70.00",
      },
      allocatedCounts: {
        pp36Obligations: 1,
      },
    });

    expect(buildPp36VatFilingDraft).toHaveBeenCalledWith({
      orgId: "95aead7c-9942-474f-b48e-2ec5b46f10c9",
      periodYear: 2026,
      periodMonth: 3,
      actorId: "b44b0b31-e293-4c2b-99b0-19f596f30c55",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tax/vat");
  });

  it("files a scoped VAT ledger draft for authorized org admins", async () => {
    vi.mocked(requireOrgAdmin).mockResolvedValue(adminContext);
    vi.mocked(markVatFilingDraftFiled).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      filingType: "pp30",
      periodYear: 2026,
      periodMonth: 3,
      status: "filed",
      outputVatTotal: "140.00",
      inputVatTotal: "70.00",
      pp36VatTotal: "0.00",
      pp36ReclaimTotal: "0.00",
      carryforwardIn: "0.00",
      carryforwardOut: "0.00",
      netPayable: "70.00",
      paymentStatus: "waiting_to_pay_tax",
    } as Awaited<ReturnType<typeof markVatFilingDraftFiled>>);

    await expect(
      fileVatLedgerDraftAction("11111111-1111-4111-8111-111111111111")
    ).resolves.toEqual({
      success: true,
      filing: {
        id: "11111111-1111-4111-8111-111111111111",
        filingType: "pp30",
        periodYear: 2026,
        periodMonth: 3,
        status: "filed",
        outputVatTotal: "140.00",
        inputVatTotal: "70.00",
        pp36VatTotal: "0.00",
        pp36ReclaimTotal: "0.00",
        carryforwardIn: "0.00",
        carryforwardOut: "0.00",
        netPayable: "70.00",
        paymentStatus: "waiting_to_pay_tax",
      },
    });

    expect(markVatFilingDraftFiled).toHaveBeenCalledWith({
      orgId: "95aead7c-9942-474f-b48e-2ec5b46f10c9",
      filingId: "11111111-1111-4111-8111-111111111111",
      actorId: "b44b0b31-e293-4c2b-99b0-19f596f30c55",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tax/vat");
  });

  it("rejects invalid VAT ledger filing ids before filing", async () => {
    vi.mocked(requireOrgAdmin).mockResolvedValue(adminContext);

    await expect(fileVatLedgerDraftAction("not-a-uuid")).resolves.toEqual({
      error: "Invalid filing id",
    });

    expect(requireOrgAdmin).toHaveBeenCalled();
    expect(markVatFilingDraftFiled).not.toHaveBeenCalled();
  });

  it("records a scoped PP36 VAT ledger payment for authorized org admins", async () => {
    vi.mocked(requireOrgAdmin).mockResolvedValue(adminContext);
    vi.mocked(recordPp36FilingPayment).mockResolvedValue({
      event: {
        id: "33333333-3333-4333-8333-333333333333",
        amount: "70.00",
        receiptNo: "PP36-RD-1",
      },
      paidObligations: [{ id: "44444444-4444-4444-8444-444444444444" }],
    } as Awaited<ReturnType<typeof recordPp36FilingPayment>>);

    await expect(
        recordPp36VatLedgerPaymentAction(
          "11111111-1111-4111-8111-111111111111",
          "70",
          "2026-05-16",
          "PP36-RD-1"
        )
    ).resolves.toEqual({
      success: true,
      payment: {
        eventId: "33333333-3333-4333-8333-333333333333",
        paidObligationCount: 1,
        amount: "70.00",
        receiptNo: "PP36-RD-1",
      },
    });

    expect(recordPp36FilingPayment).toHaveBeenCalledWith({
      orgId: "95aead7c-9942-474f-b48e-2ec5b46f10c9",
      filingId: "11111111-1111-4111-8111-111111111111",
      actorId: "b44b0b31-e293-4c2b-99b0-19f596f30c55",
      paidAt: new Date("2026-05-15T17:00:00.000Z"),
      amount: "70.00",
      receiptNo: "PP36-RD-1",
      idempotencyKey:
        "pp36-payment:95aead7c-9942-474f-b48e-2ec5b46f10c9:11111111-1111-4111-8111-111111111111:2026-05-16:70.00",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tax/vat");
  });

  it("rejects invalid PP36 VAT ledger payment input before recording", async () => {
    vi.mocked(requireOrgAdmin).mockResolvedValue(adminContext);

    await expect(
      recordPp36VatLedgerPaymentAction("not-a-uuid", "70.00", "2026-05-16")
    ).resolves.toEqual({ error: "Invalid filing id" });
    await expect(
      recordPp36VatLedgerPaymentAction(
        "11111111-1111-4111-8111-111111111111",
        "70.001",
        "2026-05-16"
      )
    ).resolves.toEqual({ error: "Amount must be a positive money value" });
    await expect(
      recordPp36VatLedgerPaymentAction(
        "11111111-1111-4111-8111-111111111111",
        "70.00",
        "not-a-date"
      )
    ).resolves.toEqual({ error: "Paid date must be a Bangkok calendar date" });
    await expect(
      recordPp36VatLedgerPaymentAction(
        "11111111-1111-4111-8111-111111111111",
        "70.00",
        "2026-05-16",
        "R".repeat(65)
      )
    ).resolves.toEqual({ error: "Receipt number must be 64 characters or fewer" });

    expect(recordPp36FilingPayment).not.toHaveBeenCalled();
  });
});
