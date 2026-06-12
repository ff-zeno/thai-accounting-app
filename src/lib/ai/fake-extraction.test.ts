import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFakeExtraction,
  FAKE_MODEL_ID,
  isFakeAiEnabled,
} from "./fake-extraction";
import { invoiceExtractionSchema } from "./schemas/invoice-extraction";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isFakeAiEnabled", () => {
  it("is disabled by default", () => {
    vi.stubEnv("E2E_FAKE_AI", "");
    expect(isFakeAiEnabled()).toBe(false);
  });

  it("is disabled for any value other than '1'", () => {
    vi.stubEnv("E2E_FAKE_AI", "true");
    expect(isFakeAiEnabled()).toBe(false);
  });

  it("is enabled when E2E_FAKE_AI=1 outside production", () => {
    vi.stubEnv("E2E_FAKE_AI", "1");
    vi.stubEnv("NODE_ENV", "test");
    expect(isFakeAiEnabled()).toBe(true);
  });

  it("throws when enabled with NODE_ENV=production", () => {
    vi.stubEnv("E2E_FAKE_AI", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => isFakeAiEnabled()).toThrow(/never be enabled in production/);
  });

  it("throws when enabled on Vercel", () => {
    vi.stubEnv("E2E_FAKE_AI", "1");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL", "1");
    expect(() => isFakeAiEnabled()).toThrow(/never be enabled in production/);
  });
});

describe("buildFakeExtraction", () => {
  // Schema-drift tripwire: the canned invoice is parsed through the live
  // invoiceExtractionSchema, so any schema change that invalidates it fails
  // here before it fails mysteriously inside an e2e run.
  it("produces a canned invoice that passes the live extraction schema", () => {
    const result = buildFakeExtraction();
    expect(() => invoiceExtractionSchema.parse(result.data)).not.toThrow();
    expect(result.data.documentNumber).toBe("INV-E2E-GOLDEN-0001");
    expect(result.data.vendorName).toBe("Golden Path Supplies Co., Ltd.");
    expect(result.data.vendorTaxId).toBe("0105561234567");
    expect(result.data.issueDate).toBe("2026-02-07");
    expect(result.data.subtotal).toBe("1000.00");
    expect(result.data.vatAmount).toBe("70.00");
    expect(result.data.totalAmount).toBe("1070.00");
    expect(result.data.confidence).toBe(0.95);
  });

  it("reports the fake model id and zero token usage", () => {
    const result = buildFakeExtraction();
    expect(result.modelUsed).toBe(FAKE_MODEL_ID);
    expect(result.tokenUsage).toEqual({ input: 0, output: 0 });
  });
});
