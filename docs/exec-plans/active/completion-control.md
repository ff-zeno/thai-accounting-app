# Completion Control

**Status:** Active checklist for post-merge holistic app completion.
**Last updated:** 2026-05-17.
**Baseline:** PR #1 is merged to `main` at `f89b7f420f4daeb80e89d631e1336be5644512d8`. Vercel Production deploy succeeded, `pnpm db:migrate` passed, `pnpm tsc --noEmit` passed, and `pnpm test:e2e e2e/smoke/all-pages.spec.ts` passed 65 routes after merge.

Use this file for the next work loop. Use `roadmap.md` as the table of contents. Historical phase plans, the overnight branch audit, and the old broad owner-test plan now live in `docs/exec-plans/completed/`.

The current selected slice is `owner-mode-ux-reset.md`. Do not add more broad accounting surface area until the owner workflow is simple and coherent.

## Active Work

- [ ] Execute `engineering-hardening.md`: commit in-flight VAT work, add CI, golden-path E2E, money-math + tax-config hardening (findings: `docs/reviews/engineering-review-2026-06-12.md`).
- [ ] Execute `ui-consistency.md` audit tasks; standardization lands after owner-mode nav reset.
- [ ] Ship owner-mode navigation: Home, Bank, Documents, Tax, More. **Still open as of 2026-06-12** — commit `2e967a3` reset the dashboard only; `src/lib/nav/structure.ts` unchanged, no routes demoted.
- [ ] Rework Home around attention items, monthly checklist, and filing status.
- [ ] Rework Bank around statement upload, transaction review, reconciliation, and unmatched items.
- [ ] Rework Documents around a unified inbox for expense docs, income docs, receipts, invoices, supplier bills, and POS exports.
- [ ] Rework Tax around monthly VAT/WHT readiness and line-level lifecycle status.
- [ ] Record workflow failures as follow-up findings by area: Bank, Documents, Reconciliation, VAT, WHT, optional modules, accountant tools.
- [ ] Close or explicitly defer external blockers before any production/fileable claim.
- [ ] Pick the next engineering slice only after the owner-mode reset lands or the user explicitly changes priority.

## Owner Workflow Requirements

- [ ] Bank is treated as the source of truth.
- [ ] Source documents and feeds explain bank movement: expenses, income documents, receipts, supplier bills, POS exports, payroll, imports, or explicit explanations.
- [ ] AI extraction/coding/rules reduce owner work to exception review.
- [ ] Reconciliation shows which bank lines are matched, partially matched, unmatched, duplicate, or explicitly explained.
- [ ] Monthly checklist asks for all bank statements, POS exports, source documents, reconciliation, VAT review, WHT review, and filing readiness.
- [ ] Advanced/accountant tools remain reachable but are hidden from default owner navigation.

## VAT/WHT Lifecycle Requirements

- [ ] VAT-bearing income and expense lines show source, date, VAT period, domestic/foreign treatment, VAT classification, VAT base, VAT amount, evidence status, and filing status.
- [ ] VAT filing status distinguishes pending review, ready for draft, in open PP30 draft, submitted/finalized in filed PP30, carried-forward credit, aged/expiring credit, missed/late correction-needed, and excluded with reason.
- [ ] Submitted PP30 filings finalize included VAT lines unless an explicit amendment/correction workflow is used.
- [ ] WHT lines show source payment/document, vendor/customer, domestic/foreign treatment, WHT rate/basis, certificate/evidence status, draft filing inclusion, submitted filing reference, and correction-needed status.
- [ ] Tax pages support owner filters by period, source, status, and problem type.

## External Blockers

- [ ] CPA/accountant review of statutory assumptions and filing/readiness workflows.
- [ ] Authenticated DBD Builder validation for TFRS/DBD financial statements, notes, Builder packet, and auditor ZIP.
- [ ] Current production SSO rate/cap and submission-format validation.
- [ ] Live Blob/Inngest WHT certificate storage QA in the deployed environment.
- [ ] Exact RD/SSO export and employee 50 Tawi production-format fixture validation.
- [ ] Exact transfer-pricing form rendering validation against current RD assets.

## Remaining Product Gaps

- [ ] Owner-mode UX: simplified nav, bank-first reconciliation, unified document inbox, monthly tax checklist, VAT/WHT line lifecycle.
- [ ] Imports: direct-clear customs, backfill/reversal depth, richer document/payment picker UX, richer charge classifier UX.
- [ ] Inventory: FIFO/specific-ID/statutory true-up, richer count edit/approval, line-level SKU assignment, demand/reorder automation.
- [ ] Sales/POS: connectors, richer settlement matching, cash slip OCR, bank matching, branch/establishment propagation, Excel/PDF section 87 exports.
- [ ] Payroll: exact file exports, employee 50 Tawi production flow, receipt attachments, reconciliation, bank matching.
- [ ] Analytics/FX: bank/WHT FX revaluation, realized settlement FX, remaining posting-context allocation metadata.
- [ ] DBD/TFRS: fileable financial statements, notes, Builder packet, and auditor ZIP after CPA/Builder validation.
- [ ] Copilot: live model orchestration, MCP, and any confirmed/posted source writes beyond current guarded preview/apply tools.
- [ ] Extraction learning: richer correction assistant and broader FedEx/Photoism held-out validation when more samples exist.

## Operating Rules

- Keep `docs/exec-plans/active/` small. Active means it drives the next work, not that it contains all evidence.
- Move shipped phase evidence to `docs/exec-plans/completed/` and summarize residuals in `roadmap.md`.
- Do not reintroduce active runtime use of `vat_records`, `vatRecords`, or `vat-records`.
- Treat filed or closed accounting/tax data as immutable unless an audited amendment or override path exists.
- For compliance behavior, use official or primary Thai RD, DBD, SSO, Customs, BOT, TFAC/TFRS sources and capture retrieval dates.
- For library/framework/API docs, use `ctx7` per `AGENTS.md`.
