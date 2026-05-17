# Plan: Phase 11 — Payroll, PIT WHT, SSO, and Annual Salary Filings

**Status:** Implementation-active — payroll schema foundation, salary master data v1, employee intake/list/allowance UI, pay-run detail/slip preview UI, PIT calculator with SSO deduction, table-driven SSO calculator, draft/approve/pay pay-run flow with GL accrual and net-payment posting, PND.1/PND.1 Kor/SSO draft filing builders, PND.1/SSO remittance GL posting, payroll filing list pages with audited submit/accept status transitions, Claude-reviewed payroll payment/remittance posting-outbox producer/handler coverage, payroll sensitive-read audit, payroll period-lock/advisory-lock guards, owner-visible workflow-testable v1 scope caveat, export coverage, and DB/UI smoke tests landed. Exact government-file exports and production SSO rate/cap configuration remain blocked on stronger official-source validation.
**Depends on:** Phases 5-6 (tax engine + WHT certificates) shipped; this adds the salary side of WHT. Phase 10 must complete migration (Week 4 dual-write + Week 5 cutover) before Phase 11 starts — see roadmap re-sequencing.
**Authority reference:** `vat-info.md` §3.1 (WHT salaries), §3.4 (50 Tawi), §6 (payroll integration), §4 (annual filings), §8.2 (WHT amendments)
**Official source refresh (retrieved 2026-05-16):**
- Revenue Department PIT overview/rates entry: `https://www.rd.go.th/english/6045.html` — pinned before calculations.
- SSO contribution config remains table-driven; no production default-rate seed is added until a current official SSO rate/cap source is validated.
- Revenue Department PND.1 English form packet URLs pinned in builder payloads: `https://www.rd.go.th/fileadmin/download/english_form/frm_pnd1.pdf` and `https://www.rd.go.th/fileadmin/download/english_form/frm_pnd1_attach.pdf`.
**Official source refresh (retrieved 2026-05-17):**
- Revenue Department English withholding-tax form index: `https://www.rd.go.th/english/42379.html` — lists PND.1, PND.1 attachment, PND.2, PND.3, PND.53, PND.54, and withholding tax certificate downloads. It is marked "For Translation Purpose Only" and last updated 20.08.2016, so it can guide layout/test fixtures but not be the sole authority for production Thai electronic export.
- Revenue Department 50 Tawi Generator download page: `https://www.rd.go.th/65920.html` — official generator, setup/config/manual downloads version 1 dated 28/12/2023, page updated 01-05-2024. Next exact 50 Tawi work should inspect the generator/manual and RD WHT software-component/data-format pages before rendering employee certificates as a production substitute.
- Revenue Department English withholding tax certificate PDF: `https://www.rd.go.th/fileadmin/download/english_form/frm_WTC.pdf` — useful bilingual field/layout reference for certificate rendering tests, but employee 50 Tawi production rendering should still be checked against current Thai generator/manual.
- Revenue Code Section 50 bis page: `https://www.rd.go.th/5937.html` — states withholding certificate issuance timing, including salary withholding under Section 50(1) by 15 February of the following tax year or within one month after an employee leaves during the year. This is the deadline basis for employee 50 Tawi workflow design.
- RD 50 Tawi Generator manual: `https://www.rd.go.th/fileadmin/user_upload/WHT/Manual50TawiGen_20231228.pdf` — confirms the official generator is intended to print Section 50 bis certificates, supports electronic signature and entity stamp setup, requires RD/SVS credentials and certificate setup, and downloads source WHT data from SVS as `.txt`. The app should treat its employee 50 Tawi renderer as a preview/export workpaper until the exact current SVS export format and generator output are fixture-tested.
- Social Security Office public data catalog entry for SSO remittance forms: `https://catalog.sso.go.th/th/organization/https-www-sso-go-th-wpr-main?private=false&res_format=PDF&tags=%E0%B9%80%E0%B8%87%E0%B8%B4%E0%B8%99%E0%B8%99%E0%B8%B3%E0%B8%AA%E0%B9%88%E0%B8%87` — lists public PDF datasets for employer/insured-person contribution remittance, dated 13 May 2021.
- SSO Sor.Por.So.1-10 PDF: `https://catalog.sso.go.th/dataset/d66067d6-cce6-42e6-b479-8a4e958338eb/resource/1841f115-b4c2-4aeb-a120-966caf5461f1/download/.pdf` — form text shows Section 1-10/1 details including worker ID/name, actual wages, contribution wages, employee contribution, deadline by the 15th of the next month, 2% monthly surcharge from the 16th, wage floor/cap notes in the form text, and rounding notes. This supports UI labels and validation warnings, but exact e-submission/export remains blocked until the current SSO submission channel/file format is validated.
**Follow-up official SSO search (retrieved 2026-05-17):**
- SSO Data Catalog organization page: `https://catalog.sso.go.th/organization/https-www-sso-go-th-wpr-main` — shows public SSO datasets including "ข้อมูลผู้ประกันตนมาตรา 33", "ฐานข้อมูลการนำส่งเงินสมทบของนายจ้าง", and contribution/receipt datasets, with recent dataset dates in late 2568. These datasets are useful validation leads for filing/remittance fields, but the catalog search did not surface a current Section 33 rate/cap announcement suitable for production seeding.
- SSO eSelf service user manual PDF: `https://idpeself.sso.go.th/login/pdf/SSO-eSelf_service_%E0%B8%84%E0%B8%B9%E0%B9%88%E0%B8%A1%E0%B8%B7%E0%B8%AD%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%83%E0%B8%8A%E0%B9%89%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A.pdf` — confirms the current eSelf channel should be checked for payment/submission workflow behavior, but it is not a statutory rate/cap source. Keep production SSO config fail-closed until the current official rate/cap and submission-format source are validated.
- Live-link check on 2026-05-17 returned HTTP 200 for RD PIT overview/rates, RD PND.1 PDF, RD PND.1 attachment PDF, RD WHT form index, RD 50 Tawi Generator page, RD Section 50 bis, RD 50 Tawi Generator manual, SSO Data Catalog organization page, and SSO eSelf service manual PDF.

## Problem

The platform handles WHT for **vendor payments** (PND.3 services to individuals, PND.53 services to Thai companies). It does not handle WHT for **employee salaries** (PND.1 monthly + PND.1 Kor annual), nor SSO contributions, nor the progressive PIT calculation that determines how much to withhold from each paycheck.

Lumera (and every juristic person operating in Thailand with staff) currently runs payroll in a spreadsheet or external tool, then manually:
- Calculates progressive PIT per employee per month using estimated annual income
- Withholds and remits via PND.1 by the 15th of the following month
- Calculates SSO from table-driven employee/employer rates and wage floor/cap config, then remits via Sor.Por.So.1-10 by the 15th; current 5% / THB 15,000 cap examples remain test fixtures until official production rate/cap validation is complete
- Compiles PND.1 Kor annual summary by end of February covering the prior calendar year
- Issues a 50 Tawi withholding certificate to each employee

Every step here is rule-driven and high-volume. It belongs in the platform.

**Key change after review:** instead of net-new `pnd1_filings` + `pnd1_kor_filings` tables that duplicate the existing WHT filing infrastructure, this phase introduces a **unified `pnd_filings` table** with a `form_type` discriminator covering PND.1 / PND.1 Kor / PND.3 / PND.53 / PND.54. Existing `wht_monthly_filings` rows migrate to the unified table.

## Requirements

### Schema

**Implemented foundation (2026-05-16):** `drizzle/0039_payroll_foundation.sql` and Drizzle schema now cover employees, employee allowances, pay runs, pay slips, unified `pnd_filings`, SSO filings, PIT bracket/deduction reference tables, and SSO config. Same-org guardrails cover establishment, employee allowance, and pay slip ownership. `/payroll` supports employee intake and dashboard read model.

#### Establishment dimension (cross-cutting from Phase 10)

Phase 10 introduces `establishments` (one PP 30 per place of business). Payroll inherits the same dimension — multi-branch tenants may choose to file PND.1 per branch (typical) or consolidated (with DG approval).

- [x] All new payroll tables include `establishment_id uuid NOT NULL` where payroll rows are tenant/branch scoped (defaults to head office for single-branch orgs via query helpers).

#### Employees and pay periods

- [x] New table `employees`:
  - `id uuid PK`
  - `org_id uuid NOT NULL` (Clerk org)
  - `establishment_id uuid NOT NULL` — primary place of work for filing grouping
  - `national_id` text — 13-digit Thai ID (or passport for non-Thai)
  - `passport_number` text — for foreign employees
  - `tax_id` text — usually same as national_id for Thai individuals
  - `full_name_th`, `full_name_en` text
  - `dob` date
  - `start_date` date NOT NULL
  - `end_date` date — null for active
  - `position` text
  - `base_monthly_salary numeric(14,2)` — v1 salary master for monthly payroll defaults
  - `salary_effective_from date`
  - `pay_frequency` text NOT NULL — `monthly` (default), `bi_weekly`, `weekly`, `daily`
  - `pay_periods_per_year` integer NOT NULL — `12` for monthly, `26` for bi-weekly, etc. (drives PIT annualization correctly)
  - `bank_account_number`, `bank_account_name`, `bank_code` text — for net pay disbursement
  - `provident_fund_eligible` boolean DEFAULT false
  - `social_security_eligible` boolean DEFAULT true
  - `social_security_first_registered_at` date — affects SSO calc edge cases
  - `is_director` boolean DEFAULT false — directors paid §40(2) hire-of-services not §40(1) employment income; affects PND.1 income-type classification
  - `notes` text
  - `created_at`, `updated_at`, `deleted_at`

- [x] New table `employee_allowances` (annual Lor.Yor.01 declarations):
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `employee_id uuid NOT NULL`
  - `tax_year` integer NOT NULL (e.g. 2026)
  - `personal_allowance` numeric(14,2) DEFAULT 60000
  - `spouse_allowance` numeric(14,2) DEFAULT 0
  - `child_count_pre_2018` integer DEFAULT 0 — THB 30,000 each
  - `child_count_post_2018_second_plus` integer DEFAULT 0 — THB 60,000 each
  - `parent_allowance` numeric(14,2) DEFAULT 0
  - `disabled_dependent_allowance` numeric(14,2) DEFAULT 0
  - `health_insurance_premium` numeric(14,2) DEFAULT 0
  - `life_insurance_premium` numeric(14,2) DEFAULT 0
  - `parents_health_insurance` numeric(14,2) DEFAULT 0
  - `pension_insurance` numeric(14,2) DEFAULT 0
  - `provident_fund_contribution_pct` numeric(5,4) DEFAULT 0
  - `ltf_rmf_ssf_amount` numeric(14,2) DEFAULT 0
  - `mortgage_interest` numeric(14,2) DEFAULT 0
  - `social_security_contribution` numeric(14,2) — auto-derived from `sso_config` × insurable wage
  - `submitted_by_employee_at` timestamptz — when employee filed Lor.Yor.01 (separate from employer-recorded entry)
  - `recorded_by_employer_at` timestamptz — when employer entered the data on behalf of employee (v1 default)
  - `recorded_by_user_id` text — Clerk user who entered
  - `effective_from_month` date — supports mid-year allowance changes (marriage, child birth) without rewriting prior pay slips
  - `created_at`, `updated_at`
  - Unique on `(org_id, employee_id, tax_year, effective_from_month)`

- [x] New table `pay_runs`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `period_start`, `period_end` date NOT NULL
  - `pay_date` date NOT NULL
  - `status` text NOT NULL — `draft`, `approved`, `paid`, `voided`
  - `approved_by`, `approved_at`
  - `notes` text
  - `created_at`, `updated_at`

- [x] New table `pay_slips` (one per employee per pay run):
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `pay_run_id uuid NOT NULL`
  - `employee_id uuid NOT NULL`
  - `pnd1_income_type` text NOT NULL DEFAULT '40_1' — `40_1` (employment §40(1)), `40_2` (hire-of-services / director compensation §40(2)). PND.1 covers both; without this discriminator, director pay is mis-classified.
  - `gross_salary` numeric(14,2) NOT NULL
  - `bonus` numeric(14,2) DEFAULT 0 — triggers `recomputeAnnualEstimate(employee_id, period_end)` to re-project PIT
  - `bonus_treatment` text DEFAULT 'rolled_in' — `rolled_in` (RD method 2 — projected into annual income) or `separate_event` (RD method 1)
  - `overtime` numeric(14,2) DEFAULT 0
  - `other_taxable_income` numeric(14,2) DEFAULT 0
  - `non_taxable_allowances` numeric(14,2) DEFAULT 0 — per diem within RD limits, etc.
  - `pit_wht` numeric(14,2) NOT NULL — withheld from this pay slip
  - `sso_employee` numeric(14,2) NOT NULL — capped per `sso_config`
  - `sso_employer` numeric(14,2) NOT NULL — capped per `sso_config`
  - `provident_fund_employee` numeric(14,2) DEFAULT 0
  - `provident_fund_employer` numeric(14,2) DEFAULT 0
  - `other_deductions` numeric(14,2) DEFAULT 0 — loans, advances
  - `severance_payment` numeric(14,2) DEFAULT 0 — terminations; special tax treatment per Labour Protection Act
  - `accrued_leave_payout` numeric(14,2) DEFAULT 0 — terminations
  - `inlieu_of_notice` numeric(14,2) DEFAULT 0 — terminations
  - `special_treatment_override` boolean DEFAULT false — when true, calculator skips standard logic; `pit_wht` is human-entered. For severance and other Phase-11.5 deferred edge cases.
  - `special_treatment_note` text — required when `special_treatment_override=true`
  - `net_pay` numeric(14,2) NOT NULL
  - `payment_method` text — `bank_transfer`, `cash`
  - `bank_transaction_id` uuid — FK to `transactions` once paid
  - `wht_certificate_id` uuid — FK to issued 50 Tawi
  - `pnd_filing_id` uuid — FK to unified `pnd_filings` (form_type='PND1')
  - `payload` jsonb — calculation breakdown (bands hit, allowances applied, YTD true-up evidence)
  - `created_at`, `updated_at`

#### Unified PND filings table (replaces planned `pnd1_filings` + `pnd1_kor_filings`)

This is a refactor of existing `wht_monthly_filings` to support all PND.x form types under one lifecycle.

- [x] New table `pnd_filings`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `form_type` text NOT NULL — `PND1`, `PND1KOR`, `PND2`, `PND3`, `PND53`, `PND54`
  - `tax_period` text NOT NULL — YYYY-MM for monthly, YYYY for annual
  - `filing_status` text NOT NULL — `draft`, `submitted`, `accepted`, `rejected`
  - `submitted_at`, `accepted_at` timestamptz
  - `total_payees` integer
  - `total_gross_amount` numeric(14,2)
  - `total_wht_amount` numeric(14,2)
  - `paid_at` timestamptz
  - `bank_transaction_id` uuid — FK to RD remittance
  - `is_amendment` boolean DEFAULT false
  - `amends_filing_id` uuid — FK to original filing being amended (per §8.2)
  - `amendment_reason` text
  - `voluntary_amendment_penalty_pct` numeric(5,4) — per §8.1 schedule when amendment
  - `surcharge_amount` numeric(14,2) — 1.5%/month on under-withheld amount
  - `rd_reference_number` text
  - `confirmation_document_id` uuid — FK to RD acceptance receipt PDF
  - `payload` jsonb — form-type-specific line items (per-employee for PND.1, per-vendor for PND.3/53)
  - **No `period_locked` boolean** — round-4 removed legacy boolean. Lock state lives in shared `period_locks` (`domain='wht'` for PND.3/53, `domain='payroll'` for PND.1/PND.1 Kor). Per `docs/_ai_context/period-lock-protocol.md`.
  - `created_at`, `updated_at`
  - Unique on `(org_id, establishment_id, form_type, tax_period, is_amendment, amends_filing_id)` — allows multiple amendments per period

- [ ] **Migration:** existing `wht_monthly_filings` rows migrate to `pnd_filings` with appropriate `form_type` discriminator. CLAUDE.md context map updated to reference `pnd_filings`.

#### SSO filings (separate — different form, different authority)

- [x] New table `sso_filings`:
  - `id uuid PK`
  - `org_id uuid NOT NULL`
  - `establishment_id uuid NOT NULL`
  - `tax_month` text NOT NULL — YYYY-MM
  - `filing_status` text — `draft`, `submitted`, `accepted`
  - `total_employees` integer
  - `total_employee_contribution` numeric(14,2)
  - `total_employer_contribution` numeric(14,2)
  - `submitted_at`, `accepted_at` timestamptz
  - `bank_transaction_id` uuid — remittance to SSO
  - `is_amendment` boolean DEFAULT false
  - `amends_filing_id` uuid
  - `amendment_reason` text
  - `sso_reference_number` text
  - `confirmation_document_id` uuid
  - **No `period_locked` boolean** — lock state in shared `period_locks` (`domain='payroll'`). Per period-lock-protocol.md.
  - `payload` jsonb — per-employee insurable-wage breakdown
  - `created_at`, `updated_at`
  - Unique on `(org_id, establishment_id, tax_month, is_amendment, amends_filing_id)`

#### Tax tables (configurable, no hard-coded defaults that drift)

- [x] New table `pit_brackets`:
  - `id uuid PK`
  - `effective_from`, `effective_to` date
  - `lower_bound`, `upper_bound` numeric(14,2)
  - `marginal_rate` numeric(5,4)
  - Seeded with current 8 bands per `vat-info.md` §6.1; explicit citation in seed file

- [x] New table `pit_standard_deductions`:
  - `id uuid PK`
  - `effective_from`, `effective_to` date
  - `employment_expense_pct` numeric(5,4) DEFAULT 0.50
  - `employment_expense_cap` numeric(14,2) DEFAULT 100000
  - `personal_allowance` numeric(14,2) DEFAULT 60000
  - `spouse_allowance` numeric(14,2) DEFAULT 60000
  - `child_pre_2018_allowance` numeric(14,2) DEFAULT 30000
  - `child_post_2018_second_plus_allowance` numeric(14,2) DEFAULT 60000
  - `parent_allowance_per` numeric(14,2) DEFAULT 30000

- [x] New table `sso_config` (Opus review fix — no hard-coded floor default):
  - `id uuid PK`
  - `effective_from`, `effective_to` date NOT NULL
  - `employee_rate` numeric(5,4) NOT NULL
  - `employer_rate` numeric(5,4) NOT NULL
  - `insurable_wage_floor` numeric(14,2) NOT NULL — explicit, no DB default; config rows must carry source citation
  - `insurable_wage_cap` numeric(14,2) NOT NULL
  - `monthly_max_per_side` numeric(14,2) NOT NULL
  - `source_citation` text NOT NULL — RD/SSO announcement reference
  - No production default seed lands until a current official Section 33 rate/cap source is validated. Tests may seed `employee_rate=0.05, employer_rate=0.05, insurable_wage_floor=1650, insurable_wage_cap=15000, monthly_max_per_side=750` with an explicit pending-validation source citation.

### Calculation engine

#### PIT calculator (Opus review fix — YTD true-up math)

- [x] New module `src/lib/payroll/pit-calculator.ts`:
  - `calculateMonthlyPit({ employee, allowances, ytdGrossPaid, ytdPitWithheld, currentMonth, currentMonthGross, payPeriodsPerYear })`
  - **Annualization:** estimated annual taxable income = `(ytd_gross_paid + current_month_gross + projected_remaining_months_gross) − employment_expense_deduction − allowances_total`. For mid-year hires, `projected_remaining_months_gross = current_month_gross × months_remaining_in_year`. For mid-year terminations, set remaining to 0.
  - **Annual PIT calculation:** apply progressive bands from `pit_brackets` to estimated annual taxable income → `estimated_annual_pit`.
  - **YTD true-up (corrected formula):** `monthly_wht = max(0, (estimated_annual_pit − ytd_pit_withheld) ÷ pay_periods_remaining_INCLUDING_current_month)`. Plan-v1 had this off-by-one (excluded current month → systematic under-withholding in final period).
  - Returns: `{ estimatedAnnualPit, monthlyWht, breakdown: BracketHit[], annualizationMethod, currentMonthEstimateChanged: boolean }`

- [ ] `recomputeAnnualEstimate(employee_id, asOfMonth)` — explicit entry point called when:
  - Bonus event (`pay_slips.bonus > 0` with `bonus_treatment='rolled_in'`)
  - Mid-year Lor.Yor.01 update (new `employee_allowances` row with `effective_from_month >= asOfMonth`)
  - Salary change (raise / promotion)
  - Pay frequency change
  - Returns the new monthly WHT for `asOfMonth` and projected remaining months. Prior pay slips are NOT retroactively adjusted (forward-only smoothing per RD practice).

#### SSO calculator

- [x] New module `src/lib/payroll/sso-calculator.ts`:
  - `calculateSso({ grossMonthly, payDate, employeeRegisteredAt })`
  - Read active `sso_config` row by `payDate` between `effective_from` and `effective_to`.
  - If `grossMonthly < insurable_wage_floor` → 0 contribution (employee not insurable below floor).
  - Insurable wage = `min(max(grossMonthly, insurable_wage_floor), insurable_wage_cap)`.
  - `employee = insurable_wage × employee_rate` capped at `monthly_max_per_side`.
  - `employer = insurable_wage × employer_rate` capped at `monthly_max_per_side`.
  - First 6 months after registration: special exemption rules — verify against current SSO announcement, return raw if no special rule applies.
  - Returns: `{ employee, employer, insurableWage, contributionExempt: boolean, exemptionReason }`

#### Pay run calculator

- [x] Draft pay-run generator in `src/lib/db/queries/payroll.ts`:
  - Pulls active employees + their effective allowances row + YTD totals, calls PIT and SSO calculators per employee, and generates `pay_slips` rows in draft state.
  - v1 UI can either use a one-off gross override across active employees or `employees.base_monthly_salary` when the override is `0.00`.
  - v1 blocks non-monthly employees because pay-period numbering for weekly/bi-weekly payroll needs a real scheduler before PIT smoothing is safe.
  - Blocks generation if PIT bracket/deduction config is missing, or if SSO-eligible employees exist without an active `sso_config` row.

### WHT certificates and filings

- [ ] Extend `src/lib/pdf/fifty-tawi.tsx` with `formType` prop (PND.1 / PND.3 / PND.53 / PND.54). Today the component is hard-coded to PND.3/53 wording.
- [ ] New module `src/lib/payroll/pnd1-builder.ts`:
  - [x] `buildPnd1Draft(orgId, taxMonth)` — aggregates unfiled approved/paid pay slips in the month into `pnd_filings(form_type='PND1')`, groups per employee/income type, links slips to the draft, stores per-employee payload lines, blocks duplicate monthly drafts, and respects payroll period locks.
  - [ ] Produce exact RD-format PND.1 CSV + PDF preview after CPA/RD format validation.
  - Generates 50 Tawi certificates en masse for all employees in the month.
  - Inserts a `pnd_filings` row with `form_type='PND1'`.
- [ ] New module `src/lib/payroll/pnd1-kor-builder.ts`:
  - [x] `buildPnd1KorDraft(orgId, taxYear)` — annual summary per employee covering approved/paid pay slips for the tax year.
  - [x] Inserts a `pnd_filings` row with `form_type='PND1KOR'`.
  - [x] Reconciliation invariant: `sum(monthly PND.1 total_wht_amount) = annual PND.1 Kor total_wht_amount`. Blocks draft creation on mismatch.
  - [ ] Exact RD-format export/rendering remains blocked on CPA/RD format validation.
- [ ] New module `src/lib/payroll/sso-form-builder.ts`:
  - [x] `buildSsoFilingDraft(orgId, taxMonth)` — aggregates pay slips with SSO contribution amounts in the month into `sso_filings`, stores per-employee payload lines, blocks duplicate monthly drafts, and respects payroll period locks.
  - [ ] Produce exact Sor.Por.So.1-10 CSV after official/current format validation.

### Filing calendar

- [ ] Extend `src/lib/tax/filing-calendar.ts`:
  - PND.1 monthly: paper 7th, e-file 15th of following month.
  - SSO Sor.Por.So.1-10 monthly: 15th of following month.
  - PND.1 Kor annual: end of February for prior calendar year.

### UI

- [x] New page `src/app/(app)/payroll/page.tsx` — payroll home foundation with employee counts, pay-run/pay-slip totals, employee intake including base monthly salary, salary-master pay-run fallback, and links to employee allowance management.
- [x] `/payroll` now exposes owner-testable draft pay-run approval, PND.1 and SSO draft builders, plus recent filing tables.
- [x] `/payroll` now shows an owner-visible workflow-testable v1 caveat: employee setup, allowances, draft pay runs, PIT/SSO calculation, filing lists, submit/accept status, remittance posting, and sensitive-read audit are testable; production filing still needs current SSO config validation, exact RD/SSO exports, employee 50 Tawi, receipt attachment, reconciliation hooks, and bank matching. Evidence: `pnpm test:e2e e2e/payroll/payroll.spec.ts`; `.next/types` + `.next/dev/types` cleanup; `pnpm tsc --noEmit`; `git diff --check`.
- [x] `src/app/(app)/payroll/employees/` — employee list v1 showing branch, status, PND.1 income type, pay frequency, and allowance readiness. Remaining: edit/terminate and establishment filter.
- [x] `src/app/(app)/payroll/employees/[id]/allowances/` — Lor.Yor.01 management v1 per tax year, mid-year additions supported via `effective_from_month`, audit log rows written on allowance creation, and sensitive national ID/bank fields intentionally withheld until PII read audit lands.
- [x] `src/app/(app)/payroll/runs/[id]/page.tsx` — pay run detail, per-employee slip preview, approval, and payment action reuse landed 2026-05-16. PII fields remain withheld; exact per-slip edits and batch payment file generation remain below.
- [ ] `src/app/(app)/payroll/runs/` — dedicated pay run list. v1 links from `/payroll` recent pay runs.
- [ ] `src/app/(app)/payroll/runs/[id]/[slipId]/edit.tsx` — per-slip override (severance / special treatment).
- [x] `src/app/(app)/payroll/filings/pnd1/` — monthly PND.1 list v1 with status, remittance state, RD reference, payee count, gross, WHT totals, and audited submit/accept actions. Remaining: exact export, receipt attachment, and bank matching workflow.
- [x] `src/app/(app)/payroll/filings/pnd1-kor/` — annual PND.1 Kor list v1 with status, RD reference, employee count, gross, WHT totals, and audited submit/accept actions. Remaining: exact export and receipt attachment workflow.
- [x] `src/app/(app)/payroll/filings/sso/` — monthly SSO list v1 with status, remittance state, SSO reference, employee count, employee/employer totals, and audited submit/accept actions. Remaining: exact export, receipt attachment, and bank matching workflow.
- [ ] Each pay slip downloadable as PDF (Thai-only initially; bilingual deferred to Phase 11.5 unless customer asks).

### Reconciliation hooks

- [ ] When a bank transaction matches a `pay_slips.net_pay` payment, auto-link `pay_slips.bank_transaction_id`.
- [ ] When a bank transaction matches a PND.1 remittance amount + RD reference, auto-link `pnd_filings.bank_transaction_id` (form_type='PND1').
- [ ] Same for SSO remittances.
- [ ] New reconciliation rule template "Salary payment to employee" + "PND.1 remittance" + "SSO contribution" auto-suggested when these patterns appear.

### Audit log: PII access

Existing `audit_log` captures mutations only. Salary data + national IDs require read-event tracking.

- [x] **Decision:** add `audit_log.action` enum value `read_pii` with `entity_type` + `entity_id` + `read_field_set` (which sensitive fields were accessed). Implemented as `drizzle/0065_audit_log_read_pii_action.sql`; `getPayrollEmployeeDetail()` logs salary/allowance/recent-slip/prior-employer reads and `getPayrollPayRunDetail()` logs pay-slip gross/WHT/SSO/net-pay reads.
- [x] Cap on volume: aggregate identical reads within a 5-minute window per actor/entity/field-set into a single row (otherwise audit log grows quadratically).
- [x] Page actor wiring: `/payroll/employees/[id]/allowances` and `/payroll/runs/[id]` pass the DB user ID from Clerk where available; unauthenticated/system test reads still log with `actor_id = null`.
- [x] Official-source rationale refresh: MDES-hosted Personal Data Protection Act B.E. 2562 unofficial translation, Section 37, requires appropriate security measures against unauthorized access/use/disclosure and review of measures when technology changes. Retrieved 2026-05-17 from `https://www.mdes.go.th/law/detail/3577-Personal-Data--Protection-Act-B-E--`. This supports access logging as an operational security control; it is not a complete legal opinion.
- [x] Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/payroll.db.test.ts`; `pnpm exec drizzle-kit check`; `pnpm db:migrate`; `pnpm test:e2e e2e/payroll/payroll.spec.ts`; `pnpm tsc --noEmit`; `git diff --check`; Claude Companion review found enum-order and audit-availability blockers, both fixed, follow-up review said "Recommendation: ship."

### Filing submission status workflow

- [x] PND.1 / PND.1 Kor submit action records RD reference, `submitted_at`, status `submitted`, and an audit event; only `draft` or `rejected` filings can be submitted.
- [x] PND.1 / PND.1 Kor accept action records or preserves RD reference, `accepted_at`, status `accepted`, and an audit event; only `submitted` filings can be accepted.
- [x] SSO submit action records SSO reference, `submitted_at`, status `submitted`, and an audit event; only `draft` filings can be submitted.
- [x] SSO accept action records or preserves SSO reference, `accepted_at`, status `accepted`, and an audit event; only `submitted` filings can be accepted.
- [x] Audit payloads include prior/new submitted and accepted timestamps, so accountant review can reconstruct acknowledgement timing changes.
- [x] SSO remittance state is now explicit via `sso_filings.paid_at` instead of UI-only payload inference; migration backfills legacy `payload.remittance` rows, legacy payload guard remains to prevent duplicate payment on existing rows, zero-contribution SSO remittance is blocked, remittance mutations write audit rows, and export includes `paid_at`.
- [x] PND.1 and SSO filing list pages expose the next remittance CTA after acceptance, reusing the existing audited remittance actions so the owner/accountant can complete submit -> accept -> pay from the filing list instead of returning to the payroll dashboard.
- [x] Intentional lock boundary: submit/accept records external authority acknowledgement metadata only; draft rebuilds, remittances, GL postings, and source amount mutations keep the period-lock guardrails. SSO v1 has no `rejected` state; rejection/amendment recovery is deferred with receipt attachment and richer filing workflows.
- [x] `/payroll/filings/sso` now surfaces an SSO Rate Check before the filing list. When an active `sso_config` exists, the page shows employee/employer rates, wage cap, max contribution per side, source citation, and a warning to verify current SSO rates/submission channel before filing. When no active config exists, the page fails closed with a visible no-active-config warning instead of implying filing readiness.
- [x] Evidence: `pnpm exec drizzle-kit check`; `pnpm db:migrate`; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/payroll.db.test.ts`; `pnpm vitest run src/lib/export/full-export.test.ts`; `pnpm test:e2e e2e/payroll/payroll.spec.ts`; `pnpm tsc --noEmit`; `git diff --check`. Claude Companion review flagged silent page-action failures, brittle row selection, missing legacy SSO paid backfill, missing remittance audit, and zero-contribution remittance as blockers/high findings; fixes landed and focused gates passed.

## Approach

### Sequencing

Per Codex review #9 — Phase 11 starts AFTER Phase 10 cutover stable. Single-track compliance to manage founder review bandwidth.

**Week 1 — Schema + employee CRUD + Lor.Yor.01 + pnd_filings refactor**
1. Migrations for all new tables.
2. Refactor existing `wht_monthly_filings` → `pnd_filings` with `form_type` discriminator. Migrate existing rows. Update references.
3. Seed `pit_brackets`, `pit_standard_deductions`, `sso_config` with 2026 values + citations.
4. [x] Employee management UI v1: roster, salary master display, and employee allowance-detail routes. Remaining: edit/terminate and establishment filter.
5. [x] Allowance declaration UI per tax year, with mid-year `effective_from_month` support and DB/audit coverage.

**Week 2 — Pay run calculation engine**
1. `pit-calculator.ts` with corrected YTD true-up math.
2. `sso-calculator.ts` with floor handling.
3. `pay-run-calculator.ts`.
4. Draft pay run flow (run calculation, edit slips, approve).
5. [x] First PND.1, PND.1 Kor, and SSO draft filing builders from generated pay slips, with DB and Playwright coverage.
6. `recomputeAnnualEstimate` entry point wired to bonus / Lor.Yor.01 / salary-change events.
6. Pay slip PDF generation (Thai-only).
7. Bank transfer file export (KBank K-Cash Connect or generic CSV).

**Week 3 — PND.1 + SSO monthly filings + amendments**
1. [x] `buildPnd1` and PND.1 Kor draft generation under unified `pnd_filings` table. Remaining: 50 Tawi mass generation.
2. `buildSor1_10`.
3. Filing UI: generate, preview, mark submitted, attach RD/SSO confirmation receipt PDF.
4. Amendment workflow per §8.2: create new filing with `is_amendment=true`, link to original, surface penalty estimate per §8.1 schedule.
5. Bank reconciliation hooks for net pay + PND.1 + SSO remittances.

**Week 4 — Annual filings + dashboards + audit log expansion**
1. [x] `buildPnd1KorDraft` annual summary with monthly-vs-annual reconciliation invariant.
2. [x] Year-end reconciliation: annual PND.1 Kor WHT must equal monthly PND.1 WHT draft totals before the draft is created.
3. Payroll dashboard: total monthly cost, upcoming deadlines, ytd taxes, employee turnover.
4. Audit log: `read_pii` action wiring.

### Dependencies

- **Phase 10** — `establishments` table introduced there; payroll inherits the dimension. Phase 11 starts only after Phase 10 cutover stable per re-sequenced roadmap.
- **Phase 5 (WHT engine)** — payroll uses the same WHT certificate infrastructure. The 50 Tawi component gets a `formType` prop. **Refactor:** migrate `wht_monthly_filings` → `pnd_filings` unified table.
- **Phase 4 (reconciliation)** — pay slip net pay + PND.1 + SSO are bank transactions that need reconciliation rule templates.
- **Phase 6 (filing calendar)** — extends existing calendar with PND.1 / SSO / PND.1 Kor entries.
- **Phase 9 (foreign-vendor tax)** — independent; payroll is domestic-only by definition. Both reference unified `pnd_filings`; coordinate migrations.

## Critical files

To be created:
- `src/lib/db/schema.ts` — all new tables + `pnd_filings` refactor + amendment fields
- `src/lib/payroll/pit-calculator.ts`
- `src/lib/payroll/sso-calculator.ts`
- `src/lib/payroll/pay-run-calculator.ts`
- `src/lib/payroll/pnd1-builder.ts`
- `src/lib/payroll/pnd1-kor-builder.ts`
- `src/lib/payroll/sso-form-builder.ts`
- `src/lib/db/queries/employees.ts`
- `src/lib/db/queries/employee-allowances.ts`
- `src/lib/db/queries/pay-runs.ts`
- `src/lib/db/queries/pay-slips.ts`
- `src/lib/db/queries/pnd-filings.ts` (unified)
- `src/lib/db/queries/sso-filings.ts`
- `src/lib/db/queries/pit-brackets.ts`
- `src/app/(app)/payroll/**` — full UI tree above

To be edited:
- `src/lib/pdf/fifty-tawi.tsx` — add `formType` prop covering PND.1 in addition to PND.3/53/54
- `src/lib/tax/filing-calendar.ts` — add PND.1, SSO, PND.1 Kor entries
- Existing `src/lib/db/queries/wht-filings.ts` — refactor or alias to unified queries
- `src/lib/db/schema.ts` — drop or rename `wht_monthly_filings` post-migration
- `src/lib/audit-log/*` — add `read_pii` action support
- `CLAUDE.md` — Context Map rows for payroll modules; replace `wht-filings` reference with `pnd-filings`

## Verification

### Worked examples (Opus review fix — must pin to-the-baht against RD calculator)

Three reference scenarios. Each pinned monthly WHT must match RD's published e-Tax calculator:

**Scenario A — Mid-year hire**
- Employee hired July 1, monthly gross ฿80,000, no allowances except defaults (personal 60k + employment expense 50% capped 100k).
- Months in year: 6 (July–December).
- Annualized projection: 80,000 × 6 = 480,000.
- Estimated annual taxable: 480,000 − 100,000 (capped employment expense) − 60,000 = 320,000.
- Annual PIT: 0 × 150k + 5% × 150k (= 7,500) + 10% × 20k (= 2,000) = 9,500.
- Monthly WHT (months 7–12): 9,500 ÷ 6 = 1,583.33 each.
- Verified against RD calculator output.

**Scenario B — Annual bonus in month 7**
- Employee at ฿50,000/mo for 12 months + ฿100,000 bonus paid in month 7.
- Estimated annual gross at month 1: 50,000 × 12 = 600,000.
- Months 1–6 monthly WHT: based on annual estimate 600,000 → annual taxable 440,000 → annual PIT 21,500 → monthly 21,500/12 = 1,791.67.
- Month 7 includes bonus, `recomputeAnnualEstimate` fires:
  - New annual estimate: 600,000 + 100,000 = 700,000.
  - New annual taxable: 700,000 − 100,000 − 60,000 = 540,000.
  - New annual PIT: 7,500 + 14,000 + 15,000 + 6,000 = 42,500.
  - YTD withheld through month 6: 1,791.67 × 6 = 10,750.
  - Months remaining including current (7) = 6.
  - Month 7 WHT: (42,500 − 10,750) ÷ 6 = 5,291.67.
  - Months 8–12 each: same calculation, will adjust slightly each period as YTD updates.

**Scenario C — Lor.Yor.01 update in month 4 (single → married + 1 child)**
- Employee at ฿60,000/mo. Months 1–3: defaults only. Months 4–12: + spouse 60,000 + child pre-2018 30,000.
- Months 1–3 WHT: annual 720,000 − 100,000 − 60,000 = 560,000 → annual PIT 32,500 → monthly 2,708.33.
- Month 4 `recomputeAnnualEstimate` with new allowances:
  - New annual taxable: 720,000 − 100,000 − 60,000 − 60,000 − 30,000 = 470,000.
  - New annual PIT: 24,500.
  - YTD withheld through month 3: 8,125.
  - Months remaining including current (4) = 9.
  - Month 4 WHT: (24,500 − 8,125) ÷ 9 = 1,819.44.

### Other verifications

- [ ] PIT calculator matches RD calculator on Scenarios A, B, C to the baht.
- [ ] SSO calculator using seeded test config: ฿50,000 gross → insurable 15,000 → ฿750 each side.
- [ ] SSO calculator using seeded test config: ฿10,000 gross → insurable 10,000 → ฿500 each side.
- [ ] SSO calculator using seeded test config: ฿1,000 gross (below floor 1,650) → 0 each side, `contributionExempt=true`.
- [ ] PND.1 (unified `pnd_filings` form_type='PND1') for a month: sum of `pay_slips.pit_wht WHERE pay_run.period in month` = `pnd_filings.total_wht_amount`.
- [ ] PND.1 Kor invariant: sum of all 12 monthly PND.1 = annual PND.1 Kor per employee. Block submission on mismatch.
- [ ] 50 Tawi certificate: rendered PDF matches RD content requirements (sequential number, payer + payee TINs, gross + WHT + net, "หัก ณ ที่จ่าย" wording, PND.1 form reference, signature line). PND.3, PND.53, PND.54 still render correctly via formType prop.
- [ ] Bank reconciliation: net pay payment auto-links to `pay_slips.bank_transaction_id` when amount + date + employee bank account match.
- [ ] Director (`is_director=true`): pay slip generated with `pnd1_income_type='40_2'`. Filed correctly under PND.1 §40(2).
- [ ] Severance: termination pay slip with `special_treatment_override=true`, `special_treatment_note`, manual `pit_wht`. Calculator skips standard logic; audit log records the override.
- [ ] Amendment: month 6 PND.1 filed under-withheld; correction filing created with `is_amendment=true`, `amends_filing_id` linked, penalty estimate per §8.1 (15 days late ≈ 5% voluntary amendment penalty + 1.5% surcharge).
- [ ] Org isolation: every query includes `org_id` scoping. Cross-tenant test passes.
- [ ] Establishment isolation: PND.1 filing for Branch A doesn't include Branch B employees.
- [x] Audit log: pay run approval, filing submission, allowance update — all log mutation events. Employee record drill-down logs `read_pii` event.

## Risks

- **PIT band drift.** PIT bands and allowances change by RD announcement. Configuration must come from `pit_brackets` / `pit_standard_deductions` tables, not hard-coded. Annual review checklist (January).
- **SSO insurable-wage cap legislative changes.** `vat-info.md` §6.2 — cap is in flux. `sso_config` is the only source; surface "verify cap is current" warning in the SSO filing UI before each month-end. No DB-level default for floor/cap (Opus review fix).
- **YTD true-up corner cases.** Mid-year termination + bonus + raise in the same period: complex. Verification scenarios cover the main paths; edge combinations may need manual review. Surface a "Verify with accountant" warning when a month's recompute changes WHT by >50%.
- **Bonus method ambiguity.** Default `bonus_treatment='rolled_in'` (RD method 2 — smoother, less surprise). Per-pay-run option to switch to `separate_event` (method 1). Document both clearly in UI.
- **Employee data sensitivity.** National IDs, salary, bank accounts. Encryption at rest is Neon default; encryption in app for highly sensitive fields might be added if customer asks. `read_pii` audit log entries.
- **Termination edge cases.** Severance pay (Labour Protection Act formula), accrued vacation payout, in-lieu-of-notice — all have specific tax treatments. v1 supports manual override; full automated treatment deferred to Phase 11.5.
- **Multi-payroll customers.** A juristic person with separate divisions may run separate pay periods. Schema supports (multiple pay runs per org per period); UX must not assume one-payroll-per-month.
- **`wht_monthly_filings` → `pnd_filings` refactor risk.** Existing PND.3/PND.53 rows must migrate cleanly; no data loss. Migration script writes both tables in parallel for one release, then cuts over reads after verification.

## Open questions

- **Bilingual pay slips.** Lumera has English-speaking staff. Worth from v1, or defer? Defer recommended; English is for employee personal records, not RD filing.
- **e-Submission to RD.** Some customers want direct push of PND.1 to RD's e-filing portal. v1 path: generate the standard CSV + walk the user through manual upload. Direct submission integration is Phase 11.5+.
- **Provident fund integration.** If the company runs a registered provident fund, contributions affect both PIT (employee deductible) and CIT (employer deductible). Schema supports; calculation initially manual entry; full PF integration deferred.
- **Foreign employee on local payroll.** PIT applies the same way; only complication is national ID format (passport-based). Schema supports via `passport_number`. Edge case: tax residency tests for the Thai 180-day rule are out of v1 scope.
- **BOI-promoted entities.** Some BOI privileges affect employee tax (foreign experts under specific BOI categories). Out of v1 scope; flag at sign-up if BOI status declared.
- **e-WHT for vendor side (cross-cutting).** Shipped via Phase 11.5 or earlier ad-hoc once vendor flows demand it. PND.1 itself is rarely e-WHT-eligible.

---

## Post-CPA-review hardening (added 2026-04-26)

### Hard dependency: Phase 10.5 GL primitives must ship FIRST

Both reviewers flagged that pay slips have 8+ implicit journal lines per slip. Without GL, payroll has no destination. **Phase 11 cannot start until Phase 10.5 GL primitives are deployed.** Roadmap re-sequenced.

### GL posting integration

- [x] When a pay run is approved, post one payroll accrual JE for the run:
```
Dr  6110 Salaries & wages (gross_salary + bonus + overtime; 6111 Bonus split if material)
Dr  6112 Social security expense — employer (sso_employer)
Dr  6114 Employee welfare (non-cash benefits if any)
    Cr  2156 WHT payable — PND.1 (pit_wht)
    Cr  2157 SSO payable (sso_employee + sso_employer)
    Cr  6110 Salaries & wages (provident fund employee deduction; reverses portion)
    Cr  2158 Salaries & wages payable (net_pay) — clears at payment
```

- [x] When pay run paid from the payroll page, post a net-payment JE and mark the pay run paid:
```
Dr  2158 Salaries & wages payable
    Cr  1111 Bank
```

- [x] PND.1 remittance from the payroll page posts a cash-out JE and stamps `pnd_filings.paid_at`:
```
Dr  2156 WHT payable — PND.1
    Cr  1111 Bank
```

- [x] SSO remittance from the payroll page posts a cash-out JE and stores remittance evidence in the filing payload:
```
Dr  2157 SSO payable
    Cr  1111 Bank
```

- [x] Payroll net-payment, PND.1 remittance, and SSO remittance now enqueue posting-outbox payment rows transactionally after the existing immediate JE path, and the shared posting processor reuses the idempotent payroll posters with payment-date guardrails. Follow-up hardening after Claude Companion review requires accepted PND.1/SSO filings before remittance, writes pay-run approval/payment audit rows, lets direct outbox replay advance source paid state idempotently, adds JE-prefix advisory locking, and takes GL posting-period advisory locks before eager payroll/remittance JEs. Evidence: `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/payroll.db.test.ts` passed 22 tests; `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/general-ledger.db.test.ts` passed 34 tests; `pnpm test:e2e e2e/payroll/payroll.spec.ts` passed 5 tests; follow-up `.next/types` + `.next/dev/types` cleanup, `pnpm tsc --noEmit`, `git diff --check`, and active-code no-`vat_records` search passed. Claude Companion final follow-up reported no blocking findings.
- [x] Payroll filing list pages: `/payroll/filings/pnd1`, `/payroll/filings/pnd1-kor`, and `/payroll/filings/sso` expose existing draft/remittance state from unified `pnd_filings` and `sso_filings`, and `/payroll` links to filing lists. Evidence: `pnpm test:e2e e2e/payroll/payroll.spec.ts`; `pnpm test:e2e e2e/smoke/all-pages.spec.ts`; `pnpm tsc --noEmit`; `git diff --check`.

### Mid-year hire prior-employer YTD

PIT annualization for an employee starting mid-year requires their prior-employer YTD to avoid systematic over-withholding. Without it, the new employer projects (current_month × remaining_months) and applies bands assuming no prior income → over-withholds significantly.

- [ ] Add to `employees`:
  - `prior_employer_ytd_gross numeric(14,2) DEFAULT 0`
  - `prior_employer_ytd_pit numeric(14,2) DEFAULT 0`
  - `prior_employer_ytd_as_of_month integer` — month up to which prior YTD applies
  - `prior_employer_ynot_certificate_document_id uuid` — uploaded prior-employer 50 Tawi (mandatory evidence)
- [ ] PIT calculator: includes `prior_employer_ytd_gross` in annual income projection. `ytd_pit_withheld = prior_employer_ytd_pit + sum(pay_slips this year)` for the YTD true-up calc.
- [ ] Onboarding flow for new hire: prompt for prior-employer 50 Tawi upload; AI extracts YTD figures; user confirms.

### Provident fund (PF) accruals — explicit handling

Schema supports; calc was deferred. Hardening for v1:
- [ ] Treat `provident_fund_employee` as a deduction from `gross_salary` for PIT purposes (within Thai PF Act limits — 15% of gross capped at 500k/year; verify current limits at seed time).
- [ ] Treat `provident_fund_employer` as additional employer cost (not part of employee taxable income up to limits).
- [ ] GL posting:
  ```
  Dr  6110 Salaries & wages (full gross)
  Dr  6113 Provident fund expense — employer
      Cr  2159 Provident fund payable (employee + employer combined) → remitted to fund manager monthly
  ```
- [ ] Calculator updated: `taxable_income = gross_salary − pf_employee_within_limits`.

### Severance / termination — clearer override path

v1 still defers Labour Protection Act formula automation but tightens the manual override:
- [ ] When `pay_slip.severance_payment > 0` OR `accrued_leave_payout > 0` OR `inlieu_of_notice > 0`:
  - Force `special_treatment_override=true`
  - Force `special_treatment_note` non-empty
  - Surface tax-treatment hint: severance up to 300,000 THB on first 10 years employment is tax-exempt; excess is taxable per progressive bands; tenant must enter the calculated PIT manually.
- [ ] Audit log captures override + reason.
- [ ] Phase 11.5 will automate per Labour Protection Act §118 + Section 48(1) PIT treatment.

### Read PII audit log

Implemented 2026-05-17 for the sensitive payroll detail reads currently exposed in v1. The read audit intentionally tracks salary/allowance/slip monetary data while national ID and bank-account fields remain withheld from these pages.

### PND.2 form coverage (cross-cutting from Phase 9)

Already in `today-gap-remediation.md` P1-2 + Phase 9 hardening. PND.2 not directly part of payroll but uses the same `pnd_filings` table and `wht_form_type` enum.

### Filing calendar adjustments

PND.1 + SSO + PND.1 Kor deadlines must use the holiday/weekend-adjusted calendar from `today-gap-remediation.md` P1-1.

### Verification additions

- [ ] Mid-year hire scenario: employee starts July 1 with prior-employer YTD ฿180k gross + ฿4,500 PIT withheld. Annual estimate = ฿180k + (current × 6) → not over-withheld.
- [ ] PF deduction: ฿50,000 gross with 5% PF → ฿2,500 PF employee deduction → taxable income reduced by ฿2,500 for PIT calc.
- [ ] Severance: tenant enters ฿500,000 severance payment for 10-year employee → first ฿300,000 tax-exempt, ฿200,000 taxable; tenant manually enters resulting PIT; system saves with `special_treatment_override=true` and audit log entry.
- [ ] PND.1 deadline falling on Songkran (April 13-15 holiday) → calendar shifts to next business day.
- [x] Approved pay runs post an `auto_payroll` GL accrual: Dr 6110 gross salary + Dr 6112 employer SSO, Cr 2156 PIT payable + Cr 2157 SSO payable + Cr 2158 net salary payable.

### `pit_brackets` cumulative-tax-at-floor for fast lookup

Round-3 review noted that the `pit_brackets` schema as drafted exposed only `marginal_rate` per band; RD's published Lor.Yor schedule uses cumulative tax-at-band-floor for fast lookup. Calculator is fragile to RD format changes without it.

- [ ] Add column to `pit_brackets`: `cumulative_tax_at_lower_bound numeric(14,2) NOT NULL`.
- [ ] Seed values per current 8 bands (cumulative tax for someone whose annual taxable income is exactly at the lower bound):
  - 0–150,000 → 0
  - 150,001–300,000 → 0
  - 300,001–500,000 → 7,500 (5% × 150,000)
  - 500,001–750,000 → 27,500 (7,500 + 10% × 200,000)
  - 750,001–1,000,000 → 65,000
  - 1,000,001–2,000,000 → 115,000
  - 2,000,001–5,000,000 → 365,000
  - >5,000,000 → 1,265,000
- [x] PIT calculator: for taxable income X, find band, then `pit = cumulative_tax_at_lower_bound + (X − lower_bound) × marginal_rate` when configured, falling back to summed bands for legacy/in-memory callers while preserving the full bracket-hit audit payload shape. Evidence: `pnpm vitest run src/lib/payroll/calculators.test.ts`; Claude Companion review finding fixed.
- [ ] `pnd_filings` migration safety per round-3: staged states (legacy_read → dual_write → verified_read_new → legacy_locked) + `legacy_wht_monthly_filing_id` preserved. Document the rollout protocol in `docs/_ai_context/pnd-filings-migration-protocol.md` before Week 1 ships.
