# Plan: Phase 12b — TFRS for NPAEs Financial Statements + DBD e-Filing Package + Audit Firm Exchange Package

**Status:** Draft — captured 2026-04-26 (split from original Phase 12)
**Depends on:** Phase 12a (CIT engine) shipped; Phase 13 (fixed assets) shipped; Phase 14 (analytics + AR/AP aging) shipped; **DBD/TFRS research spike** completed (`dbd-tfrs-research-spike.md`)
**Authority reference:** TFRS for NPAEs (Revised 2022 + DBD 2024 notification + 2026 amendments confirmed by spike); DBD e-Filing system specifications confirmed by spike

## Problem

Every Thai juristic person must file:
1. **Audited TFRS for NPAEs financial statements** with DBD within 1 month of AGM (AGM within 4 months of FY-end).
2. **PND.50 supporting financial statements** to RD (often the same as DBD filing).

Phase 12a produces the CIT calculation. This phase produces the financial statements + DBD package + auditor exchange package.

**Critical: this phase cannot start until the DBD/TFRS research spike completes.** Phase 12a referenced TFRS NPAEs and DBD format with hand-waving; round-3 review found the actual format is XBRL-in-Excel V.2.0 + Java Builder + ZIP, with annual changes. The spike confirms current spec; this phase implements against confirmed spec.

## Goals

1. **TFRS NPAEs financial statements** — Balance Sheet, Income Statement, Statement of Changes in Equity, Cash Flow Statement (indirect method), Notes to Financial Statements.
2. **Versioned COA → DBD taxonomy mapping** — seeded GL account codes are owner-friendly; statutory financial statement lines come from `dbd_template_schema.json`, not from COA prefixes alone.
3. **Comparative period rules** — current year + prior year columns; restatement when accounting policy changes.
4. **DBD e-Filing package** — Excel template populated per current taxonomy + auditor-signed PDF + ZIP for upload to DBD portal.
5. **Auditor exchange package** — single ZIP for the external CPA firm with everything they need.
6. **Multi-format export** — Thai canonical, English secondary, both side-by-side option.

## Non-goals

- **Audit itself.** Performed by Thai-licensed CPA firm. Platform produces the package; CPA signs.
- **Direct DBD API push.** Currently DBD doesn't offer this. v1 is "fill the Excel + PDF + walk user through manual upload."
- **Multi-entity consolidation.** Single-entity per org for v1.
- **Notes narrative writing.** Auto-populates per spec; bespoke management commentary is manual.

## Requirements

### Schema

- [ ] New table `financial_statements`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid` — null for consolidated; set for per-establishment
  - `tax_year integer NOT NULL`
  - `fiscal_year_start date NOT NULL`
  - `fiscal_year_end date NOT NULL`
  - `prior_year_start date NOT NULL`
  - `prior_year_end date NOT NULL`
  - `tfrs_taxonomy_version text NOT NULL` — DBD's current taxonomy version (varies annually)
  - `coa_mapping_payload jsonb` — versioned map from `gl_accounts.account_code` / subledger dimensions to DBD/TFRS line items, generated from `dbd_template_schema.json` and reviewed by CPA
  - `accounting_policy_payload jsonb` — explicit policy elections (revenue recognition, depreciation method, inventory cost flow, FX policy, lease treatment under Section 14)
  - `prior_year_restated boolean DEFAULT false` — true when accounting policy change retrospectively applied
  - `restatement_reason text`
  - `bs_payload jsonb` — Balance Sheet line items per TFRS NPAEs taxonomy
  - `is_payload jsonb` — Income Statement
  - `equity_payload jsonb` — Statement of Changes in Equity
  - `cf_payload jsonb` — Cash Flow Statement
  - `notes_payload jsonb` — full note set per `notes_taxonomy.json` (output of spike)
  - `prior_year_payload jsonb` — comparative period
  - `prior_year_source text` — `gl_generated`, `manual_import`, `auditor_adjusted_import`, `not_required_first_year`
  - `prior_year_import_document_id uuid` — uploaded prior-year audited FS/DBD Excel/PDF used when the app does not contain the comparative year
  - `prepared_by_user_id text NOT NULL`
  - `prepared_at timestamptz NOT NULL`
  - `auditor_firm text`
  - `auditor_license_number text`
  - `auditor_signed_off_by text`
  - `auditor_signed_off_at timestamptz`
  - `coa_mapping_reviewed_by text`
  - `coa_mapping_reviewed_at timestamptz`
  - `coa_mapping_review_notes text`
  - `auditor_signed_pdf_document_id uuid` — FK to uploaded signed PDF
  - `dbd_excel_document_id uuid` — FK to populated DBD Excel template
  - `dbd_xbrl_xml_document_id uuid` — FK to converted XBRL output
  - `dbd_zip_document_id uuid` — FK to final ZIP for upload
  - `dbd_submission_status text` — `not_submitted`, `submitted`, `accepted`, `rejected`
  - `dbd_submission_reference text`
  - `dbd_submitted_at timestamptz`
  - `created_at, updated_at`
  - Unique on `(org_id, tax_year)`

### TFRS NPAEs financial statements

#### Generators (per spike output)

The spike produces `notes_taxonomy.json` and `dbd_template_schema.json`. Generators read these.

- [ ] `src/lib/cit/financial-statements/balance-sheet-tfrs.ts`:
  - Reads `dbd_template_schema.json` for line-item mapping per current taxonomy.
  - Pulls account balances from Phase 10.5 GL trial balance at fiscal_year_end.
  - Maps GL accounts + control-account dimensions → TFRS line items through `coa_mapping_payload`; refuses generation if any non-zero account is unmapped.
  - Comparative column from prior year `financial_statements.bs_payload`.
- [ ] `src/lib/cit/financial-statements/income-statement-tfrs.ts`:
  - Revenue / COGS / opex / financing / income tax mapping.
- [ ] `src/lib/cit/financial-statements/equity-changes-tfrs.ts`:
  - Beginning balance, share capital changes, dividends declared, comprehensive income, ending balance.
- [ ] `src/lib/cit/financial-statements/cash-flow-indirect-tfrs.ts`:
  - Operating activities (indirect from net profit + non-cash adjustments + working-capital changes), investing, financing.
- [ ] `src/lib/cit/financial-statements/notes-tfrs.ts`:
  - Iterates `notes_taxonomy.json`. Each note has:
    - Source data path (GL query, sub-ledger query, or tenant-input field)
    - Default text template (Thai canonical)
    - Required tenant inputs (e.g. accounting policy elections)
    - Required auditor inputs (e.g. signing CPA disclosure)
  - Generates **draft** notes; tenant + auditor must review and complete.
- [ ] **Auto-generation produces drafts, not finals.** UI clearly marks "DRAFT — auditor must review before submission."

#### COA mapping review gate

- [ ] `src/lib/cit/financial-statements/coa-dbd-mapping.ts`:
  - Builds candidate mappings from seeded `dbd_taxonomy_hint`, account type, account subtype, and `dbd_template_schema.json`.
  - Requires CPA/accountant review before the first financial-statement generation for a tax year.
  - Blocks DBD Excel generation when:
    - any posted `gl_accounts` row has no mapping,
    - any `1142` processor/marketplace settlement balance is mapped into trade AR aging instead of settlement receivables,
    - `3110 Registered share capital` has posted balance while `is_postable=false`,
    - current/non-current split cannot be determined for loans, provisions, leases, or deposits.
  - Persists review metadata on `financial_statements.coa_mapping_*`.

#### Comparative-period + restatement support

- [ ] When tenant elects an accounting policy change for the new year, prior-year payload is restated per TFRS NPAEs Section on policy changes.
- [ ] Schema field `prior_year_restated` true; `restatement_reason` text required.
- [ ] Notes auto-include the policy-change disclosure note.

### DBD e-Filing package

#### Template population

- [ ] `src/lib/cit/dbd-excel-builder.ts`:
  - Reads `dbd_template_schema.json`.
  - Loads the current-version DBD Excel template from object storage (versioned).
  - Populates per the schema mapping.
  - Output: filled Excel file stored as `documents` row.
- [ ] Library: ExcelJS (Node-side) for .xlsx manipulation.
- [ ] Validation: cross-sheet ties (BS = Liab + Equity; CF closing cash = BS cash; current/prior comparative columns, required Thai text cells, and sign conventions) match what DBD's Builder enforces.
- [ ] First-year fallback: if prior-year GL does not exist in-app, require manual comparative import from the signed prior-year FS/DBD package. Store original file, parsed values, reviewer, and audit trail; never synthesize comparatives from current-year opening balances alone.

#### XBRL conversion bridge (v1: manual; v2: maybe automated)

- [ ] v1: tenant downloads filled Excel + auditor-signed PDF; runs DBD's Java Builder locally; uploads ZIP to DBD portal.
- [ ] UI walkthrough page guides tenant through:
  1. Download filled Excel from platform.
  2. Open in DBD e-Filing Builder (Windows app — link to DBD download page).
  3. Click Validate → Convert.
  4. Upload generated ZIP to DBD portal.
  5. Return to platform, paste DBD reference number, mark filing submitted.
- [ ] v2 (deferred): if DBD opens an XBRL conversion API, automate. Currently no API.

### Auditor exchange package

External auditors require a standard set of artifacts. Generate as a single ZIP.

- [ ] `src/lib/cit/audit-firm-package.ts`:
  - `buildAuditPackage(orgId, taxYear)` — generates ZIP with:
    - Trial balance (year-end)
    - General ledger detail (all journal entries for year)
    - Bank reconciliations per month with sign-off
    - VAT (PP 30) returns + supporting output/input/inventory reports
    - PP 36 returns + reclaim linkage
    - WHT (PND.x) returns + 50 Tawi certificates
    - Sales register + sales tax invoices
    - Inventory ledger + valuation method + counts (Phase 10.6)
    - Fixed asset register + depreciation schedule + disposals (Phase 13)
    - Payroll register + PND.1 + PND.1 Kor + SSO Sor.Por.So
    - AR aging schedule (Phase 14)
    - AP aging schedule (Phase 14)
    - FX revaluation entries + rate sources (Phase 14)
    - All source documents (TIs, receipts, contracts, customs forms) — referenced by ID
    - Sign-off log (audit_log entries for the year)
    - Period close attestations (Phase 14)
  - Format: PDF + Excel + CSV (where applicable). Some auditors prefer Excel / CSV for TB and GL detail.
  - Encryption: AES-256, password sent via separate channel (operationally: secure email / Signal / phone).
  - Stored on platform; downloadable by org owner with password.
- [ ] **This is the canonical builder; Phase 14's audit pack and Phase 12a's audit firm reference all point HERE.**

### UI

- [ ] `src/app/(app)/year-end/financials/[year]/page.tsx`:
  - Preview BS / IS / Equity / CF / Notes.
  - Edit accounting policy elections.
  - Manual narrative for management commentary notes.
  - Auditor sign-off upload (signed PDF).
- [ ] `src/app/(app)/year-end/dbd/[year]/page.tsx`:
  - Generate Excel template button.
  - Walkthrough for Builder + ZIP upload.
  - Submission tracking: paste DBD reference number when accepted.
- [ ] `src/app/(app)/year-end/audit-package/[year]/page.tsx`:
  - Generate ZIP button.
  - Password set + delivery channel hint.
  - Download (encrypted).

## Approach

### Sequencing (4 weeks — assumes spike output in hand)

**Week 1 — Schema + financial statement generators**
1. Schema migrations (`financial_statements`).
2. BS / IS / Equity / CF generators wired to GL queries.
3. Comparative-period support.

**Week 2 — Notes engine**
1. Notes generator iterating `notes_taxonomy.json`.
2. Auto-populate per data sources; tenant/auditor input fields surfaced.
3. Draft state with explicit "DRAFT" watermark.

**Week 3 — DBD package**
1. DBD Excel builder using ExcelJS + `dbd_template_schema.json`.
2. Validation rules matching DBD Builder.
3. UI walkthrough for manual conversion + upload.

**Week 4 — Auditor pack + first end-to-end**
1. Audit firm package builder (canonical implementation).
2. Encryption + password flow.
3. First org end-to-end: Lumera FY 2026 → financial statements → DBD package → auditor pack.

### Dependencies

- **DBD/TFRS research spike** — HARD prerequisite. Cannot start without `notes_taxonomy.json` and `dbd_template_schema.json`.
- **Phase 12a (CIT engine)** — CIT accrual + book-tax adjustments feed financial statements.
- **Phase 13, 14, 10.5, 10.6** — all data sources for the financial statements + audit pack.

## Critical files

- `src/lib/cit/financial-statements/balance-sheet-tfrs.ts`
- `src/lib/cit/financial-statements/income-statement-tfrs.ts`
- `src/lib/cit/financial-statements/equity-changes-tfrs.ts`
- `src/lib/cit/financial-statements/cash-flow-indirect-tfrs.ts`
- `src/lib/cit/financial-statements/notes-tfrs.ts`
- `src/lib/cit/dbd-excel-builder.ts`
- `src/lib/cit/audit-firm-package.ts`
- `src/lib/db/queries/financial-statements.ts`
- `src/app/(app)/year-end/financials/**`
- `src/app/(app)/year-end/dbd/**`
- `src/app/(app)/year-end/audit-package/**`

## Verification

- [ ] BS = Liabilities + Equity to the baht.
- [ ] IS net profit matches GL retained earnings movement.
- [ ] Cash flow indirect: starting cash + operating + investing + financing = ending cash.
- [ ] DBD Excel passes Builder validation (test cycle in spike).
- [ ] COA mapping gate: every non-zero GL account maps to exactly one DBD/TFRS line item; exception list is empty or CPA-approved.
- [ ] Comparative period: prior-year column matches prior-year `financial_statements` row.
- [ ] Restatement: policy change recomputes prior-year payload; notes include policy-change disclosure.
- [ ] Auditor pack ZIP: contains all expected sections; password-protected; opens cleanly.
- [ ] DBD ZIP submission: tenant uploads to DBD portal in test mode; reference number recorded.

## Risks

- **DBD format changes between spike and ship.** Spike output may stale by Phase 12b ship date. Re-validate at Week 1.
- **TFRS NPAEs taxonomy changes.** Same risk; track DBD bulletins.
- **Java Builder incompatibility.** Some users on Mac/Linux can't run the Windows-only Builder. v1 documents the workaround (use a Windows VM); v2 explores cross-platform options.
- **Auditor format preferences.** Some firms have proprietary intake formats. v1 produces generic PDF + Excel + CSV; firm-specific is a customer-by-customer ask.
- **Encryption + password channel.** Operationally awkward. Consider using Clerk-issued time-limited download tokens instead of passwords. Decide before Week 4.
