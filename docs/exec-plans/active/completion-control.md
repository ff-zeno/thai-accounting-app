# Completion Control

**Status:** Active checklist for post-merge holistic app completion.
**Last updated:** 2026-05-17.
**Baseline:** PR #1 is merged to `main` at `f89b7f420f4daeb80e89d631e1336be5644512d8`. Vercel Production deploy succeeded, `pnpm db:migrate` passed, `pnpm tsc --noEmit` passed, and `pnpm test:e2e e2e/smoke/all-pages.spec.ts` passed 65 routes after merge.

Use this file for the next work loop. Use `roadmap.md` as the table of contents. Historical phase plans and the overnight branch audit now live in `docs/exec-plans/completed/`.

## Active Work

- [ ] Run owner/accountant QA from `owner-test-plan-2026-05-17.md` against merged `main`.
- [ ] Record workflow failures as follow-up findings by area: VAT/WHT, sales/POS, GL/close, imports/inventory, payroll, fixed assets, CIT/year-end, analytics, settings, Copilot.
- [ ] Close or explicitly defer external blockers before any production/fileable claim.
- [ ] Pick the next engineering slice only after manual QA produces a concrete failure or the user approves a design for a remaining feature.

## External Blockers

- [ ] CPA/accountant review of statutory assumptions and filing/readiness workflows.
- [ ] Authenticated DBD Builder validation for TFRS/DBD financial statements, notes, Builder packet, and auditor ZIP.
- [ ] Current production SSO rate/cap and submission-format validation.
- [ ] Live Blob/Inngest WHT certificate storage QA in the deployed environment.
- [ ] Exact RD/SSO export and employee 50 Tawi production-format fixture validation.
- [ ] Exact transfer-pricing form rendering validation against current RD assets.

## Remaining Product Gaps

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
