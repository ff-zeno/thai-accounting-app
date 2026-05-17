const defaultBotFxSourceUrl =
  "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1";

const defaultUrlTemplate =
  "https://gateway.api.bot.or.th/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/?start_period={date}&end_period={date}&currency={currency}";

export interface BotFxRateRow {
  rateDate: string;
  currency: string;
  buyingRate: string | null;
  sellingRate: string | null;
  midRate: string;
  sourceUrl: string;
}

function normalizeCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`Invalid BOT FX currency: ${currency}`);
  }
  return normalized;
}

function resolveDate(value: unknown, fallbackDate: string) {
  if (typeof value !== "string") return fallbackDate;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallbackDate;
}

function resolveDecimal(value: unknown) {
  if (value == null) return null;
  const raw = String(value).replace(/,/g, "").trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric.toFixed(6);
}

function collectObjects(value: unknown, rows: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, rows);
    return rows;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    rows.push(object);
    for (const child of Object.values(object)) collectObjects(child, rows);
  }
  return rows;
}

function pick(object: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (object[key] != null) return object[key];
  }
  return null;
}

export function parseBotFxRateResponse(data: unknown, fallback: {
  currency: string;
  rateDate: string;
  sourceUrl?: string;
}): BotFxRateRow[] {
  const currency = normalizeCurrency(fallback.currency);
  const root = data as Record<string, unknown> | null;
  const detailRows =
    root &&
    typeof root === "object" &&
    "result" in root &&
    Array.isArray(
      ((root.result as Record<string, unknown> | undefined)?.data as
        | Record<string, unknown>
        | undefined)?.data_detail
    )
      ? (((root.result as Record<string, unknown>).data as Record<string, unknown>)
          .data_detail as unknown[])
      : null;
  const rows = detailRows
    ? detailRows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    : collectObjects(data);
  return rows.flatMap((row) => {
    const rowCurrency = pick(row, [
      "currency",
      "currency_id",
      "currencyId",
      "currency_code",
      "currencyCode",
    ]);
    if (!rowCurrency) return [];
    try {
      if (normalizeCurrency(String(rowCurrency)) !== currency) return [];
    } catch {
      return [];
    }

    const midRate = resolveDecimal(pick(row, ["midRate", "mid_rate", "midrate"]));
    if (!midRate) return [];

    const rateDate = resolveDate(
      pick(row, ["period", "rateDate", "rate_date", "date"]),
      fallback.rateDate
    );
    return [{
      rateDate,
      currency,
      buyingRate: resolveDecimal(pick(row, [
        "buyingTransfer",
        "buying_transfer",
        "buyingRate",
        "buying_rate",
        "buying_sight",
      ])),
      sellingRate: resolveDecimal(pick(row, ["selling", "sellingRate", "selling_rate"])),
      midRate,
      sourceUrl: fallback.sourceUrl ?? defaultBotFxSourceUrl,
    }];
  });
}

function buildUrl(template: string, data: { rateDate: string; currency: string }) {
  return template
    .replaceAll("{date}", encodeURIComponent(data.rateDate))
    .replaceAll("{start_period}", encodeURIComponent(data.rateDate))
    .replaceAll("{end_period}", encodeURIComponent(data.rateDate))
    .replaceAll("{currency}", encodeURIComponent(data.currency));
}

function buildHeaders() {
  const authorization = process.env.BOT_FX_API_AUTHORIZATION?.trim();
  const token = process.env.BOT_FX_API_TOKEN?.trim();
  const headers: Record<string, string> = { accept: "application/json" };
  const headersJson = process.env.BOT_FX_API_HEADERS_JSON?.trim();
  if (headersJson) {
    const parsed = JSON.parse(headersJson) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) headers[key] = value.trim();
    }
  }
  if (authorization) headers.authorization = authorization;
  else if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

export function getBotFxCurrencies() {
  return (process.env.BOT_FX_CURRENCIES ?? "USD,EUR,GBP,JPY,CNY,SGD,HKD,AUD")
    .split(",")
    .map((currency) => normalizeCurrency(currency))
    .filter(Boolean);
}

export async function fetchBotFxRatesForDate(data: {
  rateDate: string;
  currencies?: string[];
  sourceUrl?: string;
}) {
  const template = process.env.BOT_FX_API_URL_TEMPLATE?.trim() || defaultUrlTemplate;
  const sourceUrl = data.sourceUrl ?? defaultBotFxSourceUrl;
  const currencies = data.currencies?.map(normalizeCurrency) ?? getBotFxCurrencies();
  const rows: BotFxRateRow[] = [];

  for (const currency of currencies) {
    const url = buildUrl(template, { rateDate: data.rateDate, currency });
    const response = await fetch(url, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`BOT FX fetch failed for ${currency} ${data.rateDate}: ${response.status}`);
    }
    rows.push(...parseBotFxRateResponse(await response.json(), {
      currency,
      rateDate: data.rateDate,
      sourceUrl,
    }));
  }

  return rows;
}
