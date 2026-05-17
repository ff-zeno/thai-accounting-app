import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchBotFxRatesForDate,
  getBotFxCurrencies,
  parseBotFxRateResponse,
} from "./fx-rates";

describe("BOT FX rate integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("parses BOT daily exchange-rate response rows", () => {
    const rows = parseBotFxRateResponse(
      {
        result: {
          data: {
            data_detail: [{
              period: "2026-05-15",
              currency_id: "USD",
              buying_transfer: "36.1234000",
              selling: "36.4567000",
              mid_rate: "36.2900000",
            }],
          },
        },
      },
      { currency: "usd", rateDate: "2026-05-15", sourceUrl: "https://example.test/bot" }
    );

    expect(rows).toEqual([{
      rateDate: "2026-05-15",
      currency: "USD",
      buyingRate: "36.123400",
      sellingRate: "36.456700",
      midRate: "36.290000",
      sourceUrl: "https://example.test/bot",
    }]);
  });

  it("fetches configured currencies with authorization header", async () => {
    vi.stubEnv("BOT_FX_API_TOKEN", "secret-token");
    vi.stubEnv("BOT_FX_API_URL_TEMPLATE", "https://bot.test/rates?date={date}&ccy={currency}");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          data: {
            data_detail: [{
              period: "2026-05-15",
              currency_id: "USD",
              mid_rate: "36.2900",
            }],
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchBotFxRatesForDate({
      rateDate: "2026-05-15",
      currencies: ["usd"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://bot.test/rates?date=2026-05-15&ccy=USD",
      {
        headers: { accept: "application/json", authorization: "Bearer secret-token" },
        signal: expect.any(AbortSignal),
      }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.midRate).toBe("36.290000");
  });

  it("uses configured currency list", () => {
    vi.stubEnv("BOT_FX_CURRENCIES", "usd, sgd");
    expect(getBotFxCurrencies()).toEqual(["USD", "SGD"]);
  });

  it("supports portal-specific configured headers", async () => {
    vi.stubEnv("BOT_FX_API_HEADERS_JSON", JSON.stringify({ "X-IBM-Client-Id": "client-id" }));
    vi.stubEnv("BOT_FX_API_URL_TEMPLATE", "https://bot.test/rates?date={date}&ccy={currency}");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { data_detail: [] } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchBotFxRatesForDate({ rateDate: "2026-05-15", currencies: ["usd"] });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://bot.test/rates?date=2026-05-15&ccy=USD",
      {
        headers: { accept: "application/json", "X-IBM-Client-Id": "client-id" },
        signal: expect.any(AbortSignal),
      }
    );
  });
});
