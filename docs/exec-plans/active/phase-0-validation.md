# Phase 0: Pre-Implementation Validation Sprint

**Status:** Not started
**Duration:** 1 day
**Dependencies:** None -- this is the starting point
**Blocks:** Phase 1a (infrastructure), Phase 1b (app shell)

## Goal

Validate critical technical assumptions before writing production code. Every item here blocks a downstream phase -- if any validation fails, the plan must be revised before proceeding.

## Validations

### V1: KBank CSV/PDF Format

**Blocks:** Phase 2 (bank statement parsing)

- Download an actual KBank statement from K-BIZ portal (CSV and PDF)
- If no live account available, request an anonymized sample from the user
- Document: column headers, date format, amount format (negative = debit?), encoding (UTF-8 or TIS-620?)
- Save anonymized fixture to `tests/fixtures/bank-statements/kbank-sample.csv`
- Note any fields that differ between CSV and PDF formats

**Done when:** CSV fixture exists, column mapping documented, encoding confirmed.

### V2: DBD Open API

**Blocks:** Phase 3 (vendor auto-lookup)

- Test the endpoint: `curl https://openapi.dbd.go.th/api/v1/juristic_person/{tax_id}`
- Use a known company tax ID (e.g., `0105500002383`)
- Document: auth requirements (API key? OAuth?), rate limits, response schema
- Test error cases: invalid tax ID, non-existent company
- Check if the API returns Thai and English names, branch info, registration status
- If API requires registration, begin the process (may take days)

**Done when:** Successful API call with documented response schema, or documented that API is inaccessible (triggers fallback to OpenCorporates).

### V3: Inngest + Next.js 16

**Blocks:** Phase 1a (Inngest setup)

- Create a minimal Next.js 16 app with Inngest
- Build a hello-world Inngest function triggered by an API route
- Deploy to Vercel
- Verify: function triggers, executes, and shows in Inngest dashboard
- Test: step.run() works, failure retry works
- Confirm Inngest SDK version compatibility with Next.js 16 App Router

**Done when:** Hello-world function fires on Vercel, visible in Inngest dashboard, retry on simulated failure works.

### V4: React-PDF Thai Fonts

**Blocks:** Phase 5 (50 Tawi certificate generation)

- Build a PoC 50 Tawi certificate with `@react-pdf/renderer`
- Use Sarabun font (Google Fonts, .ttf format)
- Test: Thai text renders correctly, mixed Thai+English text, checkbox rendering
- Test: numeric formatting (Thai digits optional, Arabic digits required)
- Verify server-side rendering works (no browser dependency)
- Test at A4 size with the official 50 Tawi layout zones

**Done when:** PDF generates with readable Thai text, correct font rendering, checkboxes visible.

### V5: OpenRouter Vision Models

**Blocks:** Phase 3 (AI extraction pipeline)

- Test 3 vision models via OpenRouter API:
  - A high-quality model (e.g., Claude Sonnet, GPT-4o)
  - A mid-tier model (e.g., Gemini Flash)
  - A budget model (e.g., Llama Vision)
- Send the same sample Thai invoice image to each
- Use `generateObject()` from Vercel AI SDK with a basic invoice schema
- Compare: field accuracy, Thai text handling, response time, cost per call
- Document results in a comparison table

**Done when:** 3 models tested, results documented with accuracy/speed/cost comparison.

## Environment Setup

### Required Environment Variables

All secrets go in `.env.local` (never committed). Phase 1a will create `.env.example` with placeholder values.

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `DATABASE_URL` | Neon Postgres **pooled** connection string. Used for all application queries. Format: `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require` | Neon dashboard > Connection Details > Connection string (pooled) |
| `DATABASE_URL_UNPOOLED` | Neon Postgres **unpooled/direct** connection string. **Required for migrations** -- Drizzle migrations fail over pooled connections because they need session-level state. Format: same but different hostname. | Neon dashboard > Connection Details > Direct connection |
| `INNGEST_EVENT_KEY` | Inngest event sending key. Used by the app to send events. | Inngest dashboard > Manage > Event Keys |
| `INNGEST_SIGNING_KEY` | Inngest request signing key. Used to verify webhook authenticity. | Inngest dashboard > Manage > Signing Key |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI model access. | openrouter.ai > Keys |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token. | Vercel dashboard > Storage > Blob > Token |
| `SENTRY_DSN` | Sentry error tracking DSN. | Sentry project > Settings > Client Keys (DSN) |
| `NEXT_PUBLIC_SENTRY_DSN` | Same DSN exposed to the client for browser error reporting. | Same as SENTRY_DSN |

### Neon Pooled vs Unpooled URLs

Neon provides two connection endpoints:

- **Pooled** (default): Uses PgBouncer connection pooling. Good for serverless (many short-lived connections). Use for all runtime queries.
- **Unpooled/Direct**: Direct Postgres connection. **Migrations REQUIRE this** because `drizzle-kit` needs session-level features (transactions, SET commands) that PgBouncer in transaction mode does not support.

Both URLs look similar but have different hostnames. The pooled URL typically contains `-pooler` in the hostname.

### Thai Font Sourcing

- Font: **Sarabun** from Google Fonts
- Format: `.ttf` (TrueType) -- required by `@react-pdf/renderer`
- Weights needed: Regular (400), Bold (700)
- Download from: https://fonts.google.com/specimen/Sarabun
- Commit to repo at: `src/lib/pdf/fonts/Sarabun/Sarabun-Regular.ttf` and `Sarabun-Bold.ttf`
- Reason for committing: React-PDF needs local file access for font registration, and Google Fonts CDN URLs serve WOFF2 (not TTF)

### Timezone Convention

- **Server time:** Vercel functions run in UTC. All `TIMESTAMPTZ` columns store UTC.
- **Thai time:** Thailand is `Asia/Bangkok` (UTC+7). There is no daylight saving time.
- **`DATE` columns:** Represent Thai local dates (e.g., invoice issue date, payment date). These are dates as they appear on Thai documents.
- **Display:** All UI timestamps display in `Asia/Bangkok`.
- **Deadline calculator:** Must use `Asia/Bangkok` timezone. A filing due on the 15th means the 15th in Bangkok, not UTC.
- **Buddhist Era:** Thai tax forms use Buddhist Era year (Gregorian + 543). Internal storage uses Gregorian. Convert on display/export via `toBuddhistYear()`.

## Checkpoint

Phase 0 is done when:

- [ ] All 5 validations completed and results documented
- [ ] No blocking failures (or plan revised to address failures)
- [ ] Environment variables documented
- [ ] Font files downloaded
- [ ] Ready to begin Phase 1a
