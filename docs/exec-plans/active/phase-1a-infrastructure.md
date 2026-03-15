# Phase 1a: Infrastructure

**Status:** Not started
**Duration:** ~1 week
**Dependencies:** Phase 0 (validation sprint) completed
**Blocks:** Phase 1b (app shell), all subsequent phases

## Goal

Set up all foundational infrastructure with zero UI. After this phase, the database is ready, migrations work, Inngest runs on Vercel, seed data is loaded, monitoring is active, and core utilities exist. No browser needed to verify -- everything is testable from the command line.

## Deliverables

### Database & ORM

- Drizzle ORM schema for ALL tables (reference: `001-thai-accounting-platform.md` schema section)
  - `organizations` (with `branch_number`, `fiscal_year_end_month`, `fiscal_year_end_day`)
  - `users` (stub for future auth -- id, org_id, name, email, role)
  - `bank_accounts`
  - `bank_statements`
  - `transactions` (with indexes on org_id+date, org_id+reconciliation_status, org_id+amount+date)
  - `vendors` (with UNIQUE on org_id+tax_id+branch_number)
  - `documents` (with `related_document_id`, `exchange_rate`, `total_amount_thb`, `vat_period_year/month` — NOTE: `amount_paid`/`balance_due` are COMPUTED from `payments` table, not stored columns)
  - `document_line_items` (with `rd_payment_type_code`, `wht_rate` as NUMERIC(5,4))
  - `document_files` (with `pipeline_status`, `ai_model_used`, `ai_cost_tokens`, `ai_cost_usd` -- NOTE: `ai_extraction_status` removed per round 2 review)
  - `payments`
  - `reconciliation_matches` (with UNIQUE on transaction_id+document_id)
  - `wht_certificates` (with void support: `voided_at`, `void_reason`, `replacement_cert_id`)
  - `wht_certificate_items`
  - `wht_sequence_counters` (NO `deleted_at` -- never deleted)
  - `wht_monthly_filings` (with UNIQUE on org_id+period_year+period_month+form_type)
  - `vat_records` (with UNIQUE on org_id+period_year+period_month, separate PP 30/PP 36 status and deadlines)
  - `wht_rates` (configurable rate table with effective dates)
  - `tax_config` (key-value table for configurable parameters: vat_rate, efiling_extension_days, pp36_deadline_day, etc.)
  - `audit_log` (NO `deleted_at` -- immutable, append-only)
- All money columns use `NUMERIC(14,2)`, rate columns use `NUMERIC(5,4)`
- All tables include `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ` EXCEPT `audit_log` (no deleted_at) and `wht_sequence_counters` (no deleted_at)
- Soft delete convention enforced in schema comments
- Multi-tenancy: application-level `WHERE org_id = ?` on all queries. RLS deferred to auth phase.
- `pipeline_status` enum: uploaded, extracting, extracted, validated, failed_extraction, failed_validation, completed

### Neon Postgres Connection

- `@neondatabase/serverless` driver with Drizzle adapter
- Pooled URL (`DATABASE_URL`) for runtime queries
- Unpooled URL (`DATABASE_URL_UNPOOLED`) for migrations
- Connection helper: `src/lib/db/index.ts` exporting `db` instance
- Migration config: `drizzle.config.ts` using unpooled URL

### pnpm Migration

- Replace npm with pnpm as package manager
- `pnpm-lock.yaml` replaces `package-lock.json`
- Update any npm scripts to use pnpm
- Verify `pnpm install` and `pnpm build` work

### Testing Infrastructure

- Vitest configured for unit and integration tests
- Docker Compose file (`docker-compose.test.yml`) with local Postgres for test database
  - Postgres 16 image
  - Exposed on a non-default port (e.g., 5433) to avoid conflicts
  - Health check configured
- Test setup script that:
  - Starts Docker Compose Postgres if not running
  - Runs migrations against test database
  - Provides a clean database for each test suite (truncate tables between suites)
- `pnpm test` runs Vitest
- `pnpm test:db` runs integration tests requiring Postgres

### Inngest

- Inngest client: `src/lib/inngest/client.ts`
- Hello-world function: `src/lib/inngest/functions/hello-world.ts`
- API route: `src/app/api/inngest/route.ts` (serves Inngest functions)
- Deployed to Vercel and visible in Inngest dashboard
- Verify: event send triggers function, function completes, visible in Inngest dashboard

### Sentry Error Tracking

- `@sentry/nextjs` installed and configured
- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- `instrumentation.ts` for Next.js instrumentation hook
- Test: trigger a deliberate error, verify it appears in Sentry dashboard

### Blob Storage Abstraction

- Interface: `src/lib/storage/interface.ts`
  ```typescript
  interface BlobStorage {
    upload(path: string, data: Buffer | ReadableStream, contentType: string): Promise<{ url: string }>
    retrieve(url: string): Promise<Buffer>
    delete(url: string): Promise<void>
  }
  ```
- Vercel Blob implementation: `src/lib/storage/vercel-blob.ts`
- Factory function that returns the active implementation (enables future R2/S3 swap)

### Seed Data

- WHT rates seed: `src/lib/db/seeds/wht-rates.ts`
  - All domestic payment types x entity types (individual, company) from the rate tables
  - Service (general), Professional fees, Rent (immovable), Rent (other), Advertising, Transport, Insurance, Royalties/IP, Prizes/promotions, Interest, Dividends
  - e-WHT rates where applicable (companies only, with validity dates)
  - Foreign rates (PND 54): Service fees, Royalties, Interest, Dividends, Capital gains, Rent, Technical/mgmt fees
  - Each row includes: payment_type, entity_type, rd_payment_type_code, standard_rate, ewht_rate, effective dates
- tax_config seed: `src/lib/db/seeds/tax-config.ts`
  - `vat_rate`: 0.07 (7%, valid through Sep 2026)
  - `efiling_extension_days`: 8 (valid through Jan 2027)
  - `wht_paper_deadline_day`: 7 (7th of following month for paper filing)
  - `wht_efiling_deadline_day`: 15 (15th of following month for e-filing)
  - `pp30_efiling_deadline_day`: 23 (23rd of following month)
  - `pp36_deadline_day`: 15 (15th of following month -- different from PP 30)
- Seed command: `pnpm db:seed`

### Filing Deadline Calculator

- `src/lib/tax/filing-deadlines.ts`
- Reads deadline configuration from `tax_config` table (not hardcoded)
- Calculates filing deadlines for a given tax period (year, month):
  - WHT filing (PND 3/53/54): 7th of next month (paper) or 15th (e-filing with extension)
  - VAT PP 30: 15th of next month (paper) or 23rd (e-filing with extension)
  - VAT PP 36: 15th of next month (no e-filing extension -- separate from PP 30)
- Handles e-filing extension: adds configurable days from `tax_config`
- Uses `Asia/Bangkok` timezone for all date calculations
- If deadline falls on a weekend or Thai public holiday: currently no adjustment (holiday calendar is V2; note in code)
- Returns: `{ deadline: Date, isExtended: boolean, extensionDays: number }`

### Utilities

- `toBuddhistYear(gregorianYear: number): number` -- adds 543
  - `src/lib/utils/thai-date.ts`
  - Also include `fromBuddhistYear(buddhistYear: number): number` for parsing
- `.env.example` file at project root with all required env vars and comments:
  ```
  # Neon Postgres (pooled for queries)
  DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/dbname?sslmode=require
  # Neon Postgres (unpooled for migrations -- REQUIRED, migrations fail over pooled connections)
  DATABASE_URL_UNPOOLED=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
  # Inngest
  INNGEST_EVENT_KEY=
  INNGEST_SIGNING_KEY=
  # OpenRouter (AI models)
  OPENROUTER_API_KEY=
  # Vercel Blob storage
  BLOB_READ_WRITE_TOKEN=
  # Sentry error tracking
  SENTRY_DSN=
  NEXT_PUBLIC_SENTRY_DSN=
  ```

### Thai Font Files

- Download Sarabun from Google Fonts in .ttf format
- Commit to `src/lib/pdf/fonts/Sarabun/Sarabun-Regular.ttf`
- Commit to `src/lib/pdf/fonts/Sarabun/Sarabun-Bold.ttf`
- These are committed to the repo because React-PDF needs local file access for font registration

### npm Scripts

- `pnpm dev` -- start dev server
- `pnpm build` -- production build
- `pnpm test` -- run Vitest (unit tests, no DB required)
- `pnpm test:db` -- run integration tests (requires Docker Postgres)
- `pnpm db:generate` -- generate Drizzle migration files
- `pnpm db:migrate` -- apply migrations (uses DATABASE_URL_UNPOOLED)
- `pnpm db:seed` -- load seed data (WHT rates, tax_config)
- `pnpm db:studio` -- open Drizzle Studio for database inspection

## Tests

### Schema & Migration Tests
- Migration applies cleanly to a fresh database (`pnpm db:migrate` on empty DB)
- All tables created with correct columns, types, and constraints
- Unique constraints enforced (e.g., org_id+tax_id+branch_number on vendors)
- Foreign key relationships valid
- `deleted_at` absent from `audit_log` and `wht_sequence_counters`

### WHT Rate Lookup Tests
- Lookup returns correct rate for every payment_type x entity_type combination (domestic)
- Lookup returns correct rate for foreign entity types (PND 54)
- e-WHT rate returned when is_ewht=true and entity_type=company and within validity dates
- e-WHT rate NOT returned for individuals
- e-WHT rate NOT returned outside validity date range
- Correct `rd_payment_type_code` for each payment type

### Filing Deadline Tests
- WHT paper filing: period 2026-01 returns deadline 2026-02-07
- WHT e-filing: period 2026-01 returns deadline 2026-02-15 (with 8-day extension)
- PP 30 e-filing: period 2026-01 returns deadline 2026-02-23
- PP 36: period 2026-01 returns deadline 2026-02-15 (no extension applied)
- Timezone edge case: deadline calculated in Asia/Bangkok, not UTC
- Configurable: changing `efiling_extension_days` in tax_config changes the result

### Inngest Tests
- Hello-world function fires when event is sent
- Function completes and returns expected result
- Visible in Inngest dashboard (manual verification on Vercel)

### Blob Storage Tests
- Upload a file, receive a URL
- Retrieve the file by URL, contents match
- Delete the file by URL, subsequent retrieve fails
- Interface contract: both Vercel Blob implementation and any mock satisfy the interface

### Buddhist Era Tests
- `toBuddhistYear(2026)` returns `2569`
- `toBuddhistYear(2023)` returns `2566`
- `fromBuddhistYear(2569)` returns `2026`
- Year boundary: `toBuddhistYear(2000)` returns `2543`

## Checkpoint

Phase 1a is done when:

- [ ] `pnpm db:migrate` succeeds against Neon (unpooled URL)
- [ ] `pnpm db:seed` loads WHT rates and tax_config data
- [ ] `pnpm test` passes all unit tests (Buddhist Era, filing deadlines with mocked config)
- [ ] `pnpm test:db` passes all integration tests against Docker Postgres (schema, WHT rate lookups, deadline calculations reading from DB)
- [ ] Inngest hello-world function fires and completes on Vercel
- [ ] Sentry receives a test error
- [ ] Blob storage abstraction tests pass
- [ ] `.env.example` exists with all required variables documented
- [ ] Thai font files committed to repo
- [ ] No UI exists yet -- everything verified via tests and CLI
