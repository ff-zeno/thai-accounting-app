# TFRS for NPAEs Notes Spec — Public Desk-Check

**Status:** Pending CPA validation
**Prepared:** 2026-05-01
**Purpose:** Define the note-taxonomy shape Phase 12b needs, without pretending public desk-check replaces CPA judgment.

## Official Sources

- TFAC TFRS for NPAEs page: `https://acpro-std.tfac.or.th/standard/2/-NPAEs`
- TFAC Q&A page: `https://acpro-std.tfac.or.th/standard/24/คำถาม-คำตอบ-QA`

## Confirmed From Public TFAC Pages

- TFAC lists **TFRS for NPAEs (ปรับปรุง 2565)** for financial statements with periods beginning on or after 1 January 2023.
- TFAC lists related examples and practical Q&A, including a Q&A for practical issues under TFRS for NPAEs published 17 March 2025.
- TFAC Q&A content is guidance for applying standards and is not itself a replacement for the standards.
- The TFAC standards site includes current and future standards categories, so Phase 12b must re-check the site before implementation.

## Product Position

The platform can draft notes. It must not represent draft notes as auditor-approved financial statements.

All generated notes should be marked:

- Thai canonical first,
- English secondary if useful,
- source data listed,
- tenant-required fields listed,
- auditor-required fields listed,
- generated as draft until auditor sign-off.

## Note Groups For CPA Validation

These are intentionally broader than the old "11 notes" idea. CPA can remove or mark conditional items.

| ID | Note group | Source class | Initial status |
|---|---|---|---|
| `accounting_policies` | Significant accounting policies | Tenant + auditor input | Always expected; wording must be CPA-reviewed |
| `cash_and_bank` | Cash and cash equivalents | GL + bank subledger | Likely balance-triggered |
| `trade_receivables` | Trade and other receivables | GL + AR aging | Balance-triggered |
| `inventories` | Inventories | Inventory subledger + tenant input | Conditional on inventory |
| `property_plant_equipment` | Property, plant and equipment | Fixed asset register | Balance-triggered |
| `intangible_assets` | Intangible assets | Fixed asset/intangible register | Conditional |
| `trade_payables` | Trade and other payables | GL + AP aging | Balance-triggered |
| `provisions` | Provisions and contingencies | GL + tenant/auditor input | Conditional |
| `employee_benefits` | Employee benefits | Payroll + auditor input | Conditional by staff/benefit policy |
| `share_capital_and_equity` | Share capital and equity | GL + company registry input | Expected for companies |
| `revenue` | Revenue | GL + sales subledger | Expected when revenue exists |
| `income_tax` | Income tax | CIT engine + auditor input | Expected for taxable companies |
| `related_parties` | Related-party transactions | Tenant + auditor input | Conditional but high audit sensitivity |
| `commitments_and_contingencies` | Commitments and contingencies | Tenant + auditor input | Conditional |
| `events_after_reporting_period` | Events after reporting period | Tenant + auditor input | Conditional; requires explicit confirmation |
| `financial_risk_management` | Financial risk management | GL/subledgers + auditor input | CPA to confirm NPAE scope and wording |
| `foreign_currency` | Foreign currency transactions | GL + FX engine | Conditional on FX activity |
| `leases` | Leases | Contracts + GL + tenant input | Conditional |
| `accounting_policy_changes_errors` | Policy changes, estimates, and errors | Tenant/auditor input + comparative payload | Conditional, but needed for restatement support |

## Required Fields Per Note

Each note in `tfrs-npaes-notes-taxonomy.json` should eventually include:

- `id`
- `title_th`
- `title_en`
- `required_rule`: `always`, `balance_triggered`, `activity_triggered`, `auditor_decision`
- `source_data_paths`
- `tenant_input_fields`
- `auditor_input_fields`
- `default_text_th`
- `default_text_en`
- `comparative_period_required`
- `restatement_disclosure_required`
- `validation_rules`
- `status`
- `validated_by`
- `validated_at`

## Hard Boundaries

- Do not auto-finalize narrative note wording.
- Do not omit notes only because GL balance is zero if CPA marks the note as always-required.
- Do not use English text in Thai-only DBD cells unless CPA/DBD template confirms the cell permits it.
- Do not synthesize prior-year comparative figures from current-year opening balances alone.

## CPA Questions

1. Which note groups are always required for a normal Thai limited company using TFRS for NPAEs?
2. Which groups are conditional by balance, transaction activity, or auditor judgment?
3. Which Thai wording may be system-generated as draft boilerplate?
4. Which fields must be tenant input versus auditor input?
5. How should notes handle first-year app adoption when prior-year GL is not in the platform?
6. Which 2026 or later TFAC changes affect periods starting in 2026?
