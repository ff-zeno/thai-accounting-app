import { inngest } from "../client";
import { fetchBotFxRatesForDate, getBotFxCurrencies } from "@/lib/integrations/bot/fx-rates";
import { upsertBotFxRateFromSource } from "@/lib/db/queries/fx-rates-bot";

function bangkokDate(offsetDays = 0) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function requireDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("BOT FX rate date must use YYYY-MM-DD format");
  }
  return value;
}

export const fetchBotFxRates = inngest.createFunction(
  {
    id: "fetch-bot-fx-rates",
    retries: 2,
  },
  { cron: "30 11 * * 1-5" },
  async ({ step }) => {
    if (
      !process.env.BOT_FX_API_AUTHORIZATION &&
      !process.env.BOT_FX_API_TOKEN &&
      !process.env.BOT_FX_API_HEADERS_JSON
    ) {
      return { status: "skipped-missing-bot-auth", fetched: 0, upserted: 0 };
    }
    const auditOrgId = process.env.BOT_FX_AUDIT_ORG_ID?.trim();
    if (!auditOrgId) {
      return { status: "skipped-missing-audit-org", fetched: 0, upserted: 0 };
    }

    const rateDate = requireDate(process.env.BOT_FX_RATE_DATE_OVERRIDE?.trim() || bangkokDate());
    const currencies = getBotFxCurrencies();
    const rows = await step.run("fetch-bot-rates", async () => {
      return fetchBotFxRatesForDate({ rateDate, currencies });
    });

    await step.run("upsert-bot-rates", async () => {
      for (const row of rows) {
        await upsertBotFxRateFromSource({
          auditOrgId,
          rateDate: row.rateDate,
          currency: row.currency,
          buyingRate: row.buyingRate,
          sellingRate: row.sellingRate,
          midRate: row.midRate,
          sourceUrl: row.sourceUrl,
        });
      }
    });

    return {
      status: rows.length > 0 ? "upserted" : "no-rates-returned",
      rateDate,
      currencies: currencies.length,
      fetched: rows.length,
      upserted: rows.length,
    };
  }
);
