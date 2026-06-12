# Owner-Mode UX Reset

**Status:** Active next implementation slice.
**Created:** 2026-05-17.
**Status update 2026-06-12:** Slice 2 (Home dashboard) partially landed in commit `2e967a3`. Slice 1 (navigation/IA reset) is NOT done despite that commit's title — `src/lib/nav/structure.ts` is unchanged (same 5 categories, "More" still exposes ~37 pages, nothing demoted, no owner/accountant mode split). Slices 1, 3, 4, 5 remain open. Verify acceptance criteria against the running app, not commit messages.
**Owner direction:** The app is for a non-technical Thai business owner first. Backend accounting depth can remain, but owner navigation and primary workflows must center on bank statements, source documents, reconciliation, VAT, and WHT.

## Problem

The merged baseline exposes too much accounting, audit, and ERP-style surface area as primary navigation. That makes the product harder to use even though the underlying capabilities are useful.

The reset is not a backend deletion. It is an information-architecture and workflow reset:

- Owner mode shows the compliance work a business owner must finish each week/month.
- Accountant/admin tools remain available but stop competing with the owner workflow.
- Optional modules appear only when enabled or when there is real data for them.

## Product North Star

Bank is the source of truth. Documents, POS exports, payroll, inventory, and other feeds explain bank movement. Tax workflows consume the reconciled and coded result.

The product should answer:

- What must I upload?
- What has been matched?
- What still needs review?
- What VAT and WHT needs filing this month?
- Which tax items are already used in a submitted filing, and which are still open?

## Owner Navigation

Default owner navigation should be:

| Order | Area | Purpose |
|---|---|---|
| 1 | Home | Monthly status, next deadlines, and work needing review |
| 2 | Bank | Upload bank statements, view bank transactions, reconcile against evidence |
| 3 | Documents | Upload expenses, income invoices, receipts, supplier bills, and POS exports |
| 4 | Tax | Monthly VAT and WHT workflow, filing readiness, evidence, and status |
| 5 | Inventory | Optional next-priority module for product businesses |
| 6 | Accounting | Accountant-facing ledger, P&L, balance sheet, exports |
| 7 | Reports / More | Analytics, settings, admin, optional modules, advanced tools |

For the first implementation slice, owner mode should visibly prioritize **Home, Bank, Documents, Tax, More**. Inventory, Accounting, and Reports can remain reachable from More or an accountant mode until their owner workflows are simplified.

## Weekly Owner Workflow

1. Upload new bank statement files when available.
2. Upload source documents:
   - expense receipts and supplier invoices;
   - income invoices and receipts;
   - POS exports from systems that create income lines;
   - payroll/payment evidence where relevant.
3. AI extracts document data, proposes coding, VAT treatment, WHT treatment, vendor/customer labels, and matching rules.
4. Owner reviews exceptions only:
   - unclear vendor/customer;
   - missing or invalid VAT invoice evidence;
   - unclear domestic vs foreign treatment;
   - unclear WHT applicability;
   - duplicate or unmatched items.
5. Reconciliation confirms every bank line has evidence, a document, a POS/payroll/import feed item, or an explicit explanation.

## Monthly Compliance Workflow

The monthly checklist should guide the owner through:

- all bank statements uploaded for the month;
- all POS exports or income feeds uploaded for the month;
- income and expense documents uploaded and extracted;
- bank transactions reconciled against documents/feed items;
- VAT-bearing income and expense lines reviewed;
- WHT outgoing and incoming items reviewed;
- missing or invalid tax invoice evidence resolved or explicitly excluded;
- draft filings prepared;
- submitted filings marked final with filing evidence/reference.

## VAT Line Lifecycle

VAT workflow must expose each VAT-bearing income or expense item as a traceable lifecycle item, not just an aggregate total.

Each VAT line shown in the owner Tax workflow should make clear:

- source type: expense document, income document, POS export, import VAT, payroll-related item if relevant, or manual adjustment;
- source document or bank transaction link;
- tax invoice date / transaction date;
- VAT period it belongs to;
- domestic vs foreign treatment;
- input VAT, output VAT, PP36, exempt, no-VAT, or not-claimable classification;
- VAT amount and taxable base;
- evidence status: valid tax invoice, missing evidence, invalid evidence, or not required;
- filing status:
  - pending review;
  - ready for open draft;
  - added to open PP30 draft;
  - submitted/finalized in a filed PP30;
  - carried forward as VAT credit;
  - aged/expiring credit needing attention;
  - missed/late item needing correction or future-period handling;
  - excluded with reason.

The owner should be able to filter VAT lines by period, status, source, and problem type. The detail view should explain why the line is or is not included in the current filing.

Submitted filings must make the included VAT lines final unless an explicit amendment/correction workflow is used.

## WHT Lifecycle

WHT should use the same lifecycle pattern:

- source payment/document;
- vendor/customer;
- domestic vs foreign treatment;
- WHT rate and basis;
- certificate/evidence status;
- draft filing inclusion;
- submitted/finalized filing reference;
- missed or correction-needed status.

## Hide or Demote

These areas should stop appearing as first-class owner navigation:

- GL journal, posting exceptions, trial balance, P&L, balance sheet internals;
- CIT/year-end workbench;
- DBD/TFRS/auditor pack;
- fixed assets and depreciation internals;
- imports control details such as customs declaration, port, FX at clearance, duty, excise, broker pass-through;
- AR/AP aging, concentration, FX revaluation, advanced analytics;
- cost centers, projects, allocation rules, AI model usage, admin extraction health;
- Copilot tool runner until it is a natural-language owner assistant.

Keep routes and backend capability. Move them to More, Accountant Tools, Admin, or optional modules.

## Implementation Plan

### Slice 1: Navigation and IA Reset

- Add an owner-mode navigation structure with Home, Bank, Documents, Tax, More.
- Filter or demote advanced categories from the default owner view.
- Rename nav labels to owner language rather than accounting/audit language.
- Keep deep links working for existing routes.
- Update mobile drawer to avoid a wall of advanced categories.

### Slice 2: Home Dashboard Reset

- Replace broad analytics/dashboard blocks with:
  - "Needs your attention";
  - "Monthly checklist";
  - "This month's VAT and WHT status";
  - "Recently uploaded / matched / unresolved".
- Hide analytics snapshots behind Reports or Accountant mode.

### Slice 3: Bank-First Reconciliation Surface

- Make Bank the primary reconciliation workspace.
- Combine bank statement upload, transaction list, match status, and unresolved items into one owner-first flow.
- Link each bank line to documents, POS exports, payroll/import items, or explicit explanations.

### Slice 4: Unified Documents Inbox

- Merge expense/income document lists into one document inbox with filters.
- Make upload/capture the primary action.
- Treat POS exports as a document/feed upload type that creates income evidence lines.
- Keep document direction and extraction prompts under the hood.

### Slice 5: Tax Monthly Workflow

- Create a single monthly Tax surface for VAT + WHT readiness.
- Add VAT line lifecycle table and filters.
- Link draft/submitted PP30 status to included VAT lines.
- Add WHT lifecycle table using the same pattern.
- Keep detailed registers available as drilldowns, not primary nav.

## Acceptance Criteria

- A new owner can understand the app from the nav without seeing accounting internals.
- Owner mode has no more than five primary nav choices by default.
- Bank and Documents clearly feed reconciliation.
- Tax shows monthly VAT/WHT readiness and item-level lifecycle status.
- VAT lines can be traced from source evidence to period inclusion to draft/submitted/final filing status.
- Advanced accounting/audit/admin capabilities remain reachable but are demoted.
- Existing backend compliance capability is preserved.

## Non-Goals

- Do not delete accounting, payroll, inventory, fixed asset, CIT, DBD, or analytics backend capability.
- Do not add new statutory logic in this UX reset unless needed to show existing lifecycle status accurately.
- Do not build autonomous AI posting without explicit owner confirmation.
- Do not claim production/fileable completeness from this reset alone.

## Verification

- Navigation smoke: owner mode shows Home, Bank, Documents, Tax, More.
- Route smoke: demoted routes remain reachable by direct link or More/Accountant tools.
- VAT workflow smoke: VAT-bearing lines show source, period, evidence status, filing status, and finalization state.
- Mobile smoke: drawer remains understandable and does not expose the full advanced route set by default.
- Regression gates: `pnpm lint`, `pnpm tsc --noEmit`, `pnpm build`, and focused Playwright coverage for nav and tax workflow.
