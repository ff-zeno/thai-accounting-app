---
title: Suite relationship
description: Standalone product and the suite financial backbone.
status: canonical
as_of: 2026-08-20
---
# Suite relationship

Long Tua is both a standalone product and the suite’s books.
Repo: `suite/long-dtua` (moved here 2026-08-20).
Own roadmap. Own release cadence.
On the suite picker and the launcher (`Q-r3-04`).

## What the suite may ask

- Consume `core` orgs after the dedicated Clerk/org migration. Not a swap.
- Ingest suite POS via the `sales_transactions` / `pos_primary` contract. CSV/connectors stay for third-party POS tenants.
- Consume Staff `payroll_run.finalized` for filing/GL when both apps are on.
  Long Tua remains the full payroll UI for accounting-only tenants.
  Statutory authority sits here whenever this app is enabled.
- Share `@suite/payroll-calc`.
- Design kit already seeded `@suite/ui`. Do not fork tokens.

## What the suite must not do

- Fork tax logic into POS or Staff.
- Couple this repo’s release to Portal GA.
- Big-bang Portable SQL retrofit. New tables follow the contract; existing FKs/triggers stay until a dedicated pass.
