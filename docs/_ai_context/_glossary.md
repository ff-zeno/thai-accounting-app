# Project Glossary

Domain-specific terms used in this project. Update as new terms emerge.

## Thai Tax & Compliance

| Term | Definition | Used in |
|------|-----------|---------|
| WHT | Withholding Tax — tax deducted at source when paying for services | `src/lib/tax/`, `src/lib/db/queries/wht-*` |
| 50 Tawi (50 ทวิ) | Official WHT certificate issued to the payee documenting tax withheld | `src/lib/pdf/fifty-tawi.tsx` |
| PND 3 (ภ.ง.ด.3) | Monthly WHT filing for payments to individuals (Section 40(5)-(8)) | `src/lib/db/queries/wht-filings.ts` |
| PND 53 (ภ.ง.ด.53) | Monthly WHT filing for payments to Thai companies | `src/lib/db/queries/wht-filings.ts` |
| PND 54 (ภ.ง.ด.54) | Monthly WHT filing for payments to foreign entities | `src/lib/db/queries/wht-filings.ts` |
| PP 30 (ภ.พ.30) | Monthly VAT return. `net_vat_payable = output_vat - input_vat_pp30` | `src/lib/db/queries/vat-records.ts` |
| PP 36 (ภ.พ.36) | Reverse charge VAT on foreign services. NEVER offsets PP 30 | `src/lib/db/queries/vat-records.ts` |
| Section 40 | Revenue Code income classification (40(1)=salary, 40(2)=hire, 40(6)=professional, 40(8)=services) | `src/lib/tax/service-categories.ts` |
| Buddhist Era (พ.ศ.) | Thai calendar year = Gregorian + 543. Used on all RD forms and certificates | `src/lib/utils/thai-date.ts` |
| RD | Revenue Department (กรมสรรพากร) — Thai tax authority | `src/lib/tax/rd-csv-export.ts` |
| DBD | Department of Business Development (กรมพัฒนาธุรกิจการค้า) — Thai company registry | `src/lib/api/dbd-client.ts` |
| Nil filing | PP 30 must be filed every month even with zero VAT activity | `src/lib/db/queries/vat-records.ts` |
| Period locking | When a filing is marked "filed", edits to documents in that period are blocked | `src/lib/db/queries/wht-filings.ts` |
| e-WHT | Electronic WHT with reduced rates (1% instead of 3%) for eligible payments | `src/lib/db/queries/wht-rates.ts` |
| ใบสำคัญรับเงิน | Payment voucher — company-prepared document for individual payees to sign | Phase 3 individual payment flow |

## Banking & Documents

| Term | Definition | Used in |
|------|-----------|---------|
| KBank / K-BIZ | KasikornBank's online banking platform, source of CSV/PDF bank statements | `src/lib/parsers/kbank-parser.ts` |
| External ref | Deterministic hash or bank reference number used for transaction dedup | `src/lib/parsers/kbank-parser.ts` |
| Pipeline status | Tracks document processing: uploaded → extracting → validated → completed (or failed_*) | `src/lib/inngest/functions/process-document.ts` |
| Direction | Document classification: expense (purchase) or income (sale) | `src/lib/db/schema.ts` |

## Reconciliation

The matching engine runs a 7-layer cascade (reference → alias → exact → rule → multi-signal → split → ambiguous). Each layer either produces a match or passes to the next.

| Term | Definition | Used in |
|------|-----------|---------|
| 7-layer cascade | Matching pipeline: reference, alias, exact, rule, multi-signal, split, ambiguous — evaluated in order | `src/lib/reconciliation/matcher.ts` |
| Reference match (L0) | Matched by invoice number, tax ID, or vendor name found in transaction description | `matcher.ts` Layer 0 |
| Alias match (L1) | Matched via confirmed vendor bank alias (counterparty text → vendor mapping) | `matcher.ts` Layer 1, `vendor-aliases.ts` |
| Exact match (L2) | Bank transaction amount equals payment net amount, within ±7 days. Confidence 1.0 | `matcher.ts` Layer 2 |
| Rule match (L3) | Matched by a reconciliation rule's conditions (counterparty contains, amount range, etc.) | `matcher.ts` Layer 3, `reconciliation-rules.ts` |
| Multi-signal match (L4) | Weighted score from 6 signals: amount (0.35), counterparty (0.25), date (0.15), direction (0.10), bank affinity (0.10), channel (0.05) | `matcher.ts` Layer 4 |
| Split match (L5) | 2-3 bank transactions whose sum equals the payment amount | `matcher.ts` Layer 5 |
| Ambiguous match (L6) | Multiple transactions match equally — flagged for manual resolution, never auto-picked | `matcher.ts` Layer 6 |
| Match metadata | JSONB on `reconciliation_matches` storing layer, signals, candidateCount, selectedRank | `matcher.ts`, `match-display.ts` |
| Vendor bank alias | Learned mapping from bank counterparty text to vendor. Auto-confirms at 3 occurrences | `src/lib/db/queries/vendor-aliases.ts` |
| Reconciliation rule | User/template/auto-suggested rule with conditions and actions (assign vendor, auto-match, etc.) | `src/lib/db/queries/reconciliation-rules.ts` |
| Rule template | Industry-specific rule set (common, restaurant, consulting, ecommerce) seeded on onboarding | `src/lib/reconciliation/templates/` |
| Auto-suggested rule | Rule created by Inngest after 3+ manual matches with same counterparty pattern | `src/lib/inngest/functions/suggest-rules.ts` |
| AI batch matching | Hourly Inngest job that sends unmatched transactions + candidate docs to LLM for match suggestions | `ai-reconciliation-dispatcher.ts`, `ai-reconciliation-batch.ts` |
| Confidence badge | Color-coded UI indicator: high (>=0.90, green), medium (>=0.70, amber), low (<0.70, red) | `src/components/reconciliation/confidence-badge.tsx` |
| Insights dashboard | Metrics page showing match rate by layer, trends, rule effectiveness, AI approval rate, rejections | `src/app/(app)/reconciliation/insights/` |
| Petty cash | Small transactions below a configurable threshold, excluded from auto-matching | Transaction table UI |
| Combined payment | One bank transaction paying multiple documents (batch payment to one vendor) | `src/lib/db/queries/reconciliation.ts` |

## AI & Extraction

| Term | Definition | Used in |
|------|-----------|---------|
| generateObject | Vercel AI SDK function for structured extraction with Zod schema validation | `src/lib/ai/extract-document.ts` |
| AI confidence | 0-1 score indicating extraction certainty. <0.7 triggers review flag | `src/lib/ai/schemas/invoice-extraction.ts` |
| Model escalation | On extraction failure, retry with a stronger/more expensive model within budget | `src/lib/inngest/functions/process-document.ts` |
| Budget guard | Per-document $0.50 cost limit on AI extraction attempts | `src/lib/inngest/functions/process-document.ts` |
| Reconciliation budget | Separate $1.00/month default budget for AI batch matching (text-only, cheaper than extraction) | `src/lib/ai/reconciliation-cost-tracker.ts` |
| Index-based IDs | AI prompts use T1/D1 indices instead of UUIDs — mapped back after parsing AI response | `src/lib/ai/prompts/reconciliation-batch.ts` |
| AI suggestion | LLM-recommended match stored in `ai_match_suggestions` with status pending/approved/rejected | `src/lib/db/queries/ai-suggestions.ts` |
| Inngest fan-out | Dispatcher cron collects eligible orgs, emits one event per org to the per-org batch processor | `ai-reconciliation-dispatcher.ts` → `ai-reconciliation-batch.ts` |

## Infrastructure

| Term | Definition | Used in |
|------|-----------|---------|
| orgScope | Helper returning `[eq(table.orgId, orgId), isNull(table.deletedAt)]` for tenant isolation | `src/lib/db/helpers/org-scope.ts` |
| orgScopeAlive | Variant for tables without `deletedAt` (audit_log, wht_sequence_counters) | `src/lib/db/helpers/org-scope.ts` |
| auditMutation | Fire-and-forget audit log writer. Never throws, never blocks the main operation | `src/lib/db/helpers/audit-log.ts` |
| Inngest | Background job framework. One function per document, step-based retry, concurrency control | `src/lib/inngest/` |

## How to Use This File

When you encounter an unfamiliar term in the codebase:
1. Check this glossary first
2. If not listed, find its definition in code or documentation
3. Add it here for future reference

Keep definitions concise — one sentence per term. Include where the term
is primarily used (which service, module, or context).
