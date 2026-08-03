# Documents-First Accounting Workflow Reset

**Status:** Design gate exited 2026-08-02 — shell/kit implementation in progress.
**Authority:** This is the single authoritative active plan for the owner-facing product reset.
**Last revised:** 2026-08-02.
**Decision source:** `docs/reviews/consolidated-design-guidance-2026-08-01.md`.
**Design-gate evidence:** `docs/reviews/owner-mode-ux-reset-approved-mockups-2026-08-01.html` (three Lavish review rounds; owner approval "Good, looks aligned now" plus recorded decisions below).
**Execution constraint:** The VAT lifecycle read-model gate remains closed — no owner lifecycle table or new VAT/WHT explanatory flow until it is resolved.

## Purpose

Make the first useful owner experience a proof-oriented accounting loop rather than a navigation tour of the entire accounting system.
The opening workflow begins with two complementary truth documents: bank statements establish money and cash truth, while POS sales exports establish customer-transaction, gross/net sales, VAT, and SKU truth.
The owner uploads both sides, the system extracts and normalizes them, the owner confirms exceptions, and reconciliation explains where money is, where it came from, and what sale or evidence supports it.
Expense receipts and supplier tax invoices then enter as VAT-bearing evidence that reconciles against the same bank movement.
Accounting, tax filing, inventory, reporting, and administration remain available through progressive disclosure after this evidence loop is clear.

The result should let a Thai business owner answer four questions without understanding ledger internals:

1. What source files are missing or still need review?
2. How much money arrived or left, and where is it now?
3. Which customer transaction, POS sale, receipt, or supplier tax invoice proves each movement?
4. Which confirmed VAT-bearing records are ready, blocked, or already frozen in a filing?

## Progress

- [x] July navigation infrastructure is shipped: the shared navigation registry, pins, Reports hub, responsive shell, Help sidebar, route/deep-link support, and static React Flow renderer remain assets to reuse.
- [x] Existing evidence capabilities are shipped: bank import, document capture and extraction, POS CSV/manual sales capture, reconciliation, VAT operations, WHT, inventory, and Help flows.
- [x] The 2026-08-01 consolidated guidance established the five-choice owner projection and corrected stale route/help/CI measurements.
- [x] This plan was revised from an owner-first implementation sequence to a documents-first workflow sequence.
- [x] Product/design gate: exited 2026-08-02 — the owner approved the shell/nav/visual mockups through three Lavish review rounds (evidence: `docs/reviews/owner-mode-ux-reset-approved-mockups-2026-08-01.html`) and answered the four open product questions (POS placement, nav pins, top bar, brand romanization).
- [x] The shell/kit implementation sequence for the approved direction is planned and underway (tokens → shell cutover → route tabs → page sweeps → legacy rip-out; DESIGN.md is the governing contract).
- [x] Shell/kit implementation executed 2026-08-02 (working tree, uncommitted): Ink Neutral tokens, new shell (`app-sidebar`, `top-bar`, `mobile-tab-bar`), nav badges, route-tab layouts for VAT/WHT/reconciliation/bank/documents, three page-sweep batches, and the legacy rip-out (two-tier sidebar, mobile drawer, nav pins, dark mode).
  Every stage closed green on `pnpm build && pnpm test && pnpm lint`; the `user_nav_pins` drop migration (`drizzle/0002_bitter_sasquatch.sql`) is generated but not applied — its commit and `pnpm db:migrate` run remain owner-gated.
- [x] Peer review (GPT 5.6 Sol, two passes) and the `/design-review` visual audit close with zero P1 findings.
  Sol pass (a) React/Next correctness and pass (b) UX consistency ran 2026-08-02; all six pass-(b) findings (4 P1 + 2 P2) were fixed and re-verified green.
  The `/design-review` audit (2026-08-02, desktop + 390×844, EN + TH, evidence: `docs/reviews/design-audit-2026-08-02/`) confirmed the remediations and surfaced one further P1 — document-side reconciliation badges bypassing the status registry — fixed in `document-table.tsx` and `document-detail-sidebar.tsx` the same day.
  All work remains uncommitted in the working tree; commits are owner-gated.
- [ ] Resolve the VAT lifecycle read-model/source-of-truth contract before displaying a new owner lifecycle table or explanatory VAT/WHT flow.
- [ ] Complete the staged technical work and focused acceptance evidence after approval.

## Decisions

| Decision | Rationale | Status |
| --- | --- | --- |
| The foreground is `Home`, `Bank`, `Documents`, `Tax`, and `More`. | This is the focused owner projection decided in consolidated design guidance. | Approved product direction. |
| The starting loop is Bank statement + POS sales data, not a generic owner dashboard. | These inputs establish the two initial truths: actual money/cash and customer-sale provenance. | Approved product direction. |
| Expense documents follow as VAT-bearing evidence against bank outflows. | A payment slip proves movement, while a valid supplier tax invoice proves an input-VAT claim. | Approved product direction. |
| AI proposes; a person confirms. | Confirmed source data and match decisions are required before compliance-facing presentation or learning promotion. | Approved product principle. |
| Extraction becomes more deterministic only through confirmed patterns. | Existing corrective-learning tables, shadow validation, and compiled-pattern controls provide the safe route away from recurring token use. | Approved technical direction; promotion thresholds remain implementation decisions. |
| Existing routes and accounting capability are preserved. | The reset changes projection and workflow, not historical links or domain capability. | Approved product direction. |
| React Flow remains explanatory only. | Help diagrams must not calculate readiness, persist edits, or mutate accounting state. | Approved product direction. |
| VAT lifecycle UI waits for a truthful read model. | `src/lib/tax/vat-register.ts` still reads `documents`, while filing state is authoritative in `vat_input_items`, `vat_output_items`, `vat_filings`, and `vat_filing_lines`. | Blocking technical decision. |
| Single sidebar with five top-level items (Home, Bank, Documents, Tax, More) + Settings footer; no owner/pro mode toggle. | Owner rejected the toggle during mockup review: "minimise menu items and fold complexity inside pages". Depth budget is two nav levels; deeper structure becomes route-based in-page tab strips so all deep links survive. | Approved 2026-08-02 (design gate). |
| POS appears as a profile-gated sixth top-level item "Sales" when `organizations.hasPosSales` is set. | Resolves open decision 1 — POS-enabled orgs get a foreground entry; others see exactly five items. | Approved 2026-08-02 (owner decision). |
| Nav pins are removed and `user_nav_pins` is dropped. | The pin feature does not fit the minimal five-item nav; dashboard shortcuts section goes with it. | Approved 2026-08-02 (owner decision). |
| Visual system is "Quicken Soft" + Ink Neutral: gray canvas, white 14px-radius cards, near-black ink accent; warm golden-brown retired; dark mode removed. | Owner-approved mockups; DESIGN.md rewritten as the governing contract. | Approved 2026-08-02 (design gate). |
| Brand romanization is "Long Tua". | Owner decision (RTGS romanization); Thai name ลงตัว unchanged. | Approved 2026-08-02 (owner decision). |

## Orientation and Evidence

### Current entry points and ownership

| Concern | Current paths and symbols | Plan implication |
| --- | --- | --- |
| Bank statement truth | `src/app/(app)/bank-accounts/upload/actions.ts`: `parseFileAction`, `parseWithMappingAction`, `checkOverlapAction`, `confirmImportAction`; `src/lib/db/schema.ts`: `bankStatements`, `transactions`; `src/lib/parsers/kbank-pdf-parser.ts`, `kbank-parser.ts`, `csv-parser.ts`, and `balance-validation.ts` | Preserve parser preview, balance warning, overlap knockout, and transaction de-duplication; place them in the first upload flow. |
| Evidence capture | `src/app/(app)/documents/upload/actions.ts`: `uploadDocument`; `src/lib/db/schema.ts`: `documents`, `documentLineItems`, `documentFiles`; `src/app/(app)/documents/[docId]/review/` | Reframe Documents as an evidence inbox, but retain document direction, review, storage, and deep links. |
| AI extraction | `src/lib/inngest/functions/process-document.ts`: `processDocument`; `src/lib/ai/extract-document.ts`: `extractDocument`; `src/lib/ai/schemas/invoice-extraction.ts`; `documentFiles.ai*` and `extractionLog` | Make pipeline state, confidence, and human-confirmed correction visible as evidence provenance, not as an AI control panel. |
| POS/customer truth | `src/app/(app)/sales/actions.ts`: `importPosSalesCsvAction`, `createManualPosSaleAction`, `recordCashDepositAction`, `recordProcessorSettlementAction`; `src/lib/db/queries/pos-sales-ledger.ts`: `importPosSalesCsv`, `createManualPosSale`, `getPosSalesWorkflowDashboard`; `salesTransactions`, `processorSettlements`, `cashDeposits`, `skus` | Reuse the existing POS import contract and surface settlement/cash-deposit exceptions as links in the Bank/Documents flow; do not represent POS CSV as an image document. |
| Reconciliation | `src/lib/reconciliation/matcher.ts`: `findMatches`; `src/lib/inngest/functions/reconcile-document.ts`: `reconcileDocument`; `src/lib/db/queries/reconciliation.ts`; `src/app/(app)/reconciliation/` | Present existing bank-to-evidence matching as the center of the owner loop, preserving `/reconciliation/*` URLs and review behavior. |
| VAT truth | `src/lib/db/queries/vat-operations-ledger.ts`: `getVatOperationsLedgerOverview`, `getVatLedgerPeriodDashboard`, `getVatFilingDrilldown`, `getVatLedgerRegister`; `vatInputItems`, `vatOutputItems`, `vatFilings`, `vatFilingLines` | Build the owner view only after an explicit read-model decision and contract tests make source, period, eligibility, draft allocation, and filed snapshot state agree. |
| Help and diagrams | `src/lib/help/content.ts`: `HELP_CONTENT`; `src/lib/help/content.test.ts`; `src/components/help/flows/monthly-loop.ts`, `vat-flow.ts`, `wht-flow.ts`, `flow-viewer.tsx` | Update help at the owner decision point and publish a checklist/textual equivalent with every new diagram. |

### Domain model for the documents-first loop

```text
Bank statement file
  -> bank_statements + transactions                 (money/cash truth)
  -> reconciliation_matches <- confirmed evidence

POS export / manual POS entry
  -> sales_transactions + SKU inventory movements   (customer-sale truth)
  -> vat_output_items + settlement/cash-deposit work
  -> processor settlements / cash deposits
  -> bank transactions

Expense receipt / supplier tax invoice
  -> documents + document_files + document_line_items
  -> confirmed extraction and tax-treatment evidence
  -> vat_input_items when eligibility is authoritative
  -> payments / reconciliation_matches -> bank transactions
```

The display model must make the distinction between an input and a derived record explicit.
Bank statement files, POS export rows, and retained document files are immutable source evidence after import except for their permitted correction/audit lifecycle.
Extracted fields, categorization, tax treatment, matches, settlement links, and filing allocations are derived decisions that must carry status, actor/provenance, and a drilldown to their source.

### Source-of-truth rules

1. `bank_statements` and `transactions` are money-movement truth after parser validation, import de-duplication, and the retained uploaded statement context.
2. `sales_transactions` are customer-transaction truth for a POS source, including gross amount, tax base, VAT, invoice identity, channel, branch/terminal, and settlement state.
3. `documents`, `document_files`, and `document_line_items` retain source evidence and human-confirmed document facts; a payment slip never substitutes for a supplier tax invoice for input VAT.
4. `reconciliation_matches` explains a bank transaction using the selected evidence or payment, but does not overwrite the bank transaction or source document.
5. `vat_input_items`, `vat_output_items`, `vat_filings`, and append-only `vat_filing_lines` own VAT lifecycle and filed snapshots; owner screens must not infer filed state from document status alone.
6. `skus` and `inventory_movements` own SKU stock/cost effects; POS presentation may summarize SKU provenance but must not create a second sales or inventory ledger.
7. `extractionLog`, `extractionCorrectionSessions`, `extractionReviewOutcome`, `extractionLearningCandidates`, and `extractionCompiledPatterns` own learning evidence and promotion state; no raw user explanation is appended directly to a future model prompt.
8. A user-facing total must name its basis: bank movement, POS gross sale, processor net settlement, cash deposit, confirmed evidence, or filing snapshot.

## User Flow and Product-Design Gate

### Target first-run and monthly flow

1. Home identifies the current period and asks for the two source inputs: bank statements and POS sales data when the organisation has POS enabled.
2. Bank starts with account selection and statement upload, then shows parser/balance/overlap results and the imported money timeline.
3. Documents offers two clearly separate upload choices: POS sales data for customer transactions, and expense evidence for receipts/supplier tax invoices.
4. POS import shows accepted rows, rejected rows, gross/net/VAT totals, SKU presence or absence, expected settlement route, and resulting exceptions; it links back to its source import rather than pretending the data is a scanned invoice.
5. AI extracts expense documents, the owner reviews only confidence, identity, total, VAT, and tax-invoice exceptions, then confirms evidence.
6. Reconciliation presents the remaining question: which bank movement is explained by a POS settlement, cash deposit, confirmed expense/payment, or an explicit exception; it retains the current manual and AI-review safeguards.
7. Tax reads only the resulting authoritative VAT state and presents readiness, blocked evidence, draft allocation, and filed traceability.

### Required design work before code

- Produce working, bilingual desktop and mobile mockups for the same three benchmark workflows: statement-to-money timeline, POS-import-to-settlement reconciliation, and expense-tax-invoice-to-input-VAT reconciliation.
- Use the existing owner projection and the reusable composite vocabulary proposed by the guidance: `PageFrame`, `WorkflowHeader`, `ReadinessSummary`, `WorkQueue`, `EvidenceTable`, `ReviewDrawer`, and `FilingCard`.
- Show normal, empty, import-error, extraction-review, ambiguous-match, unmatched-cash, missing-tax-invoice, and filed/frozen states rather than only happy paths.
- Decide whether POS appears as a Documents subflow, a profile-gated foreground shortcut, or both; `/sales` remains reachable until a decision is implemented.
- Validate Thai and English copy, focus order, mobile disclosure, status language, and source provenance labels with the product owner.
- Record the chosen direction and prototype evidence in `docs/exec-plans/active/design-refresh.md` and align component-standardisation work with `docs/exec-plans/active/ui-consistency.md`; do not duplicate their full work here.

**Gate exit criteria:** The product owner approves a clickable/working mockup set, names the three benchmark flows and the POS placement decision, approves the source/provenance vocabulary, and accepts the status/error treatment.
Until this gate exits, this plan is proposed and not implementation-ready.

## Staged Technical Work After Approval

### Stage 0 — Record approved interaction contract

1. Add the approved flow, copy, profile-gating decision, desktop/mobile states, and non-goals to this plan's Decisions and Progress sections.
2. Update the owner-facing portion of `ui-consistency.md` only when its shared-table/status contract is approved; keep pattern inventory and visual-direction work in their existing plans.
3. Write a narrow ADR-level decision for the VAT lifecycle read model if the decision changes table ownership, projections, or migration strategy.

### Stage 1 — Establish the dual-source intake and evidence queues

1. Rework `src/app/(app)/bank-accounts/page.tsx`, `upload/page.tsx`, `smart-upload-form.tsx`, and account detail components to make statement upload, import validation, and unresolved money visible as one Bank workspace without changing `parseFileAction` or `confirmImportAction` semantics.
2. Introduce the approved Documents shell around `src/app/(app)/documents/`, `document-table.tsx`, and `documents/upload/`, with explicit entry points for expense evidence and POS data rather than a generic upload pile.
3. Keep `src/app/(app)/sales/page.tsx` and `sales/actions.ts` as the initial POS implementation boundary; add an adapter/view model only after mockup approval determines its placement.
4. Use the existing `organizations.hasPosSales` capability for POS visibility (implemented 2026-08-02: profile-gated "Sales" nav item; Payroll gated by `hasEmployees`), and define any additional approved profile predicates before gating further visibility through `src/lib/nav/structure.ts` and the shell components (`app-sidebar.tsx`, `mobile-tab-bar.tsx`).
5. Preserve direct routes, source file storage, deduplication, audit behavior, and the distinction between document upload formats and normalized POS CSV input.

### Stage 2 — Make reconciliation an evidence-provenance workspace

1. Create a Bank-owned workspace/tab or composed page that uses `getReconciliationStats`, `getUnmatchedTransactions`, `getUnmatchedDocuments`, `getRecentMatches`, and existing review actions without duplicating matcher logic.
2. Present each transaction with money direction, source statement, linked evidence type, POS/settlement/cash-deposit provenance where available, match status, confidence, and the next safe human action.
3. Retain `findMatches()` and the existing seven-layer cascade, manual review, AI suggestion lifecycle, alias learning, and rule suggestion paths; no new automatic posting or autonomous match confirmation is in scope.
4. Make “money location” a defined, evidence-backed state: bank account transaction, processor clearing/settlement, cash awaiting deposit, or an explicit unresolved exception.
5. Preserve `/reconciliation`, `/reconciliation/review`, `/reconciliation/ai-review`, and `/reconciliation/insights` deep links while moving their owner entry point under Bank.

### Stage 3 — Establish VAT/WHT lifecycle truth before lifecycle UI

1. Decide whether the owner lifecycle table reads `vat_input_items`/`vat_output_items` directly, through a new query projection, or after reconciling the legacy document-based `src/lib/tax/vat-register.ts` report; document the chosen owner of filed state and period state.
2. Add contract tests around `getVatLedgerPeriodDashboard`, `getVatFilingDrilldown`, and the chosen owner-facing query to prove source links, establishment, tax period, eligibility, draft allocation, filed line, carry-forward, and amendment behavior agree.
3. Use `taxTreatmentDecisions` and VAT item status to distinguish valid evidence, missing/invalid evidence, no-VAT/exempt/not-claimable/PP36 treatment, and human review; do not manufacture a lifecycle from `documents.status`.
4. Only then create the Tax “This Month” entry surface and lifecycle tables, with VAT and WHT drilldowns rather than making detailed registers top-level owner navigation.
5. Keep submitted filing snapshots final except through the existing explicit amendment/correction path and period locking behavior.

### Stage 4 — Turn confirmed extraction patterns into deterministic extraction safely

1. Continue initial extraction through `processDocument` and `extractDocument`, with budget tracking in `documentFiles` and `extractionLog`, while the vendor/document family has no confirmed deterministic pattern.
2. On confirmed review, record corrections and structured candidate evidence through `extractionCorrectionSessions`, `extractionReviewOutcome`, `extractionLearningCandidates`, and the handlers `review-saved-handler.ts` and `review-confirmed-handler.ts`.
3. Scope reusable learning by vendor identity and document family, not arbitrary natural-language instructions; retain tenant isolation and use `field-criticality.ts` to demand stricter evidence for amount, VAT, tax ID, and date fields.
4. Compile only confirmed patterns through `compile-vendor-pattern.ts` into `extractionCompiledPatterns`, run the AST/sandbox protections in `src/lib/ai/compiled-patterns/`, and validate them through `shadow-validate-pattern.ts` and `shadow-canary.ts` before activation.
5. Use a deterministic extractor or regex/template only when a pattern is active for its intended scope; retain a small LLM sanity check or fallback until the approved promotion/demotion criteria are met.
6. Immediately demote/retire an active pattern on defined correction or shadow-regression thresholds, retain the original AI/extraction evidence, and route the document to review instead of silently overwriting data.
7. Keep extraction health, token cost, accuracy, shadow agreement, fallback rate, correction rate, and activation/demotion reasons in admin observability; do not expose implementation controls as an owner workflow.

### Stage 5 — Documentation, Help, and progressive disclosure

1. Update `src/lib/help/content.ts` with explicit Bank, Documents/POS, Tax, and source-provenance guidance at each decision route; add missing high-stakes `/tax` coverage rather than relying on generic fallback text.
2. Extend `src/lib/help/content.test.ts` for foreground-route coverage, flow IDs, valid CTA links, and each new diagram's ordered text/checklist equivalent.
3. Add the approved static diagrams in `src/components/help/flows/` using `step`, `action`, `outcome`, and `note`, adding `decision`/`state` only when necessary; keep `FlowViewer` non-mutating and pair every flow with accessible ordered content.
4. First diagrams after approval: bank-statement-to-match and POS-sale-to-settlement/cash-deposit; defer VAT/WHT lifecycle diagrams until Stage 3 establishes authoritative transitions.
5. Keep `docs/_ai_context/accounting-structure-map.md` and `docs/_ai_context/reconciliation-architecture.md` as engineering orientation, not direct owner copy.

## Interfaces and Dependencies

- Navigation projection depends on `src/lib/nav/structure.ts`, `src/components/layout/app-sidebar.tsx`, `src/components/layout/top-bar.tsx`, and `src/components/layout/mobile-tab-bar.tsx`; desktop and mobile derive from the same registry (nav pins and the two-tier shell were removed 2026-08-02).
- Bank import depends on existing KBank PDF/CSV and generic CSV parser contracts and must preserve `transactions.externalRef`/statement overlap behavior.
- POS intake depends on the current normalized CSV headers enforced by `POS_CSV_REQUIRED_HEADERS` in `src/lib/db/queries/pos-sales-ledger.ts`; source-specific connectors and alternate raw exports require a separate ingest-contract decision.
- Reconciliation depends on the existing matcher, review actions, AI suggestion budget, and `reconciliation_matches` audit/soft-delete semantics.
- Owner VAT presentation depends on a resolved VAT read model, existing filing locks, and `vat_filing_lines` snapshots; it must not silently alter statutory computations.
- The UI composition depends on the approved shared data-table and bilingual status registry from `ui-consistency.md` and the owner-approved visual direction from `design-refresh.md`.

## Migration, Feature Flags, and Recovery

1. Ship the documents-first owner projection behind an organisation-scoped feature flag or profile capability, with an explicit fallback to current routes and nav for existing organisations until acceptance evidence is complete.
2. Do not rename or remove existing routes for navigation reasons; route aliases and deep links remain valid, including `/sales` and `/reconciliation/*`.
3. Introduce any new owner read model as a backward-compatible projection first; backfill from authoritative source tables in idempotent batches, verify counts/totals/sample provenance, then enable the new UI.
4. If a projection, parsing adapter, or deterministic extractor fails validation, disable its flag/active pattern and return to the existing AI-backed or current-route path; do not delete source evidence or filed snapshots.
5. Make POS-bank settlement matching additive and reviewable; preserve unresolved balance/cash variance records rather than auto-clearing them in migration.
6. No data migration or feature flag is authorized by this planning pass; implementation must specify exact migration files, reversibility, and rollout metrics after the design gate.

## Tests and Acceptance Criteria

### Focused tests to add or extend during implementation

- Parser tests: `src/lib/parsers/kbank-parser.test.ts`, `kbank-pdf-parser.test.ts`, `csv-parser.test.ts`, `balance-validation.test.ts`, plus the approved Bank workspace integration tests.
- Document/extraction tests: `src/lib/ai/extract-document.test.ts`, `src/lib/ai/fake-extraction.test.ts`, correction-learning DB tests, compiled-pattern AST/sandbox/shadow tests, and `process-document` behavior for fallback and review.
- POS tests: `src/lib/db/queries/pos-sales-ledger-schema.db.test.ts` plus import tests for required headers, idempotency, gross = base + VAT, tax-invoice uniqueness, SKU-linked sale behavior, settlement, and cash-deposit variance.
- Reconciliation tests: `src/lib/reconciliation/matcher.test.ts`, `rule-engine.test.ts`, `match-display.test.ts`, `src/lib/db/queries/reconciliation-rules.db.test.ts`, and route-level coverage for manual/ambiguous/AI-suggested match states.
- VAT truth tests: `src/lib/db/queries/vat-operations-ledger.db.test.ts`, `vat-operations-ledger-schema.db.test.ts`, `src/lib/tax/vat-register.test.ts`, and new cross-read-model contract tests before Tax lifecycle UI work.
- Help and accessibility tests: `src/lib/help/content.test.ts` for every foreground route, flow reference, CTA, and textual alternative.

### Product acceptance criteria

- A new owner can complete the bank statement + POS upload loop and see a reconciled explanation of money, sale provenance, settlement/cash location, and unresolved exceptions without entering accounting internals.
- An expense tax invoice can be uploaded, extracted, human-confirmed, linked to a bank outflow, and shown with truthful VAT evidence/eligibility status.
- POS gross, net settlement, VAT, and SKU-related effects are never presented as the same number or as a bank-confirmed cash movement before reconciliation.
- Every owner total and status drills down to its source evidence and identifies whether it is source data, extracted data, a human decision, or a filing snapshot.
- AI never autonomously posts, finalizes a tax record, confirms an ambiguous match, or activates an unvalidated deterministic pattern.
- Existing deep links and accountant/admin capability remain reachable, while the default projection has at most five primary choices and profile-gates inapplicable modules.
- The approved desktop/mobile mockups, Thai/English content, status registry, focus order, and text alternatives for diagrams are verified before release.

### Verification sequence after implementation approval

1. Run the affected unit/database tests listed above while developing each stage.
2. Run focused route tests for Bank, Documents, POS, Reconciliation, Tax, navigation, and Help after their corresponding changes.
3. Perform a seeded end-to-end golden path: bank statement import -> POS import -> settlement/cash-deposit exception -> expense invoice extraction/review -> reconciliation -> VAT readiness drilldown.
4. Inspect source-to-projection totals and sample record drilldowns before enabling an organisation flag.
5. Run the repository-required lint, typecheck, build, and relevant Playwright smoke suite only when an approved implementation slice reaches its release gate.

## Explicit Deferrals

- No application code, schema migration, configuration change, or generated artifact is part of this planning pass.
- No autonomous accounting posting, AI match confirmation, deterministic-extractor activation without shadow evidence, or direct mutation from Help diagrams.
- No removal of accounting, payroll, inventory, fixed-asset, CIT, DBD/TFRS, analytics, imports, reports, Copilot, or admin capabilities.
- No direct Revenue Department e-submission, e-Tax issuance, marketplace/delivery/POS connector build-out, raw source-specific POS parser expansion, cash-slip OCR, or automatic bank matching beyond the existing reviewed mechanisms.
- No broad domain-module refactor, schema split, service-layer rewrite, content-platform/MDX migration, React Flow editor, command palette, or persistent global period context.
- No VAT/WHT lifecycle diagram or owner lifecycle table until the VAT read-model decision and tests are complete.

## Open Decisions

1. ~~Is POS a Documents subflow, a profile-gated foreground shortcut, or both for POS-enabled organisations?~~ Resolved 2026-08-02: profile-gated top-level "Sales" item when `hasPosSales`; `/sales` routes unchanged.
2. Which POS exports are the v1 supported input contracts beyond the existing normalized CSV, and who owns a mapping/template for each source?
3. What exact promotion, shadow-agreement, manual-review, and demotion thresholds apply to high-criticality extraction fields in production?
4. What query/projection is the owner-facing VAT lifecycle source, and should `src/lib/tax/vat-register.ts` be migrated, retained as a statutory report, or explicitly separated from lifecycle presentation?
5. Which period controls determine the Bank/Documents default period when a source date, bank statement period, POS sold date, and VAT tax point differ?
6. Beyond the verified `organizations.hasPosSales` capability, which profile predicates should govern Payroll, Assets, and PP36 visibility, and what is the approved default for organisations with incomplete profile data?
7. What wording and escalation path should an owner use for an unexplained bank transaction, a POS settlement variance, and a missing/invalid input-VAT invoice?

## Surprises and Discoveries

- The prior plan's claim that the navigation reset was the next implementation slice is stale; consolidated guidance confirms July navigation infrastructure is shipped and should be reused, not rebuilt.
- The current application has distinct bank, document, POS, and reconciliation implementations, but the owner-facing flow does not yet make their different source-of-truth roles explicit.
- POS is currently a manual/normalized-CSV v1 control tower, and its page explicitly defers connectors, processor matching, cash-slip OCR/bank matching, and some statutory exports.
- VAT lifecycle presentation has a material source-of-truth gap because the legacy VAT register reads documents while operations-ledger filing state is materialized elsewhere.

## Outcomes and Retrospective

This plan replaces the prior owner-first sequencing with a documents-first sequence while preserving the useful five-choice owner projection, progressive disclosure, route stability, Help, and UI-consistency conclusions.
No implementation has been authorized by this plan revision.
