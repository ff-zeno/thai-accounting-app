---
title: POS ingest
description: Suite POS contract and third-party import. Both are real.
status: canonical
as_of: 2026-08-20
---
# POS ingest

**Job.** Sales are the money-in source of truth.
Two paths, both real:

- Suite POS publishes through the versioned sales contract.
- The tenant imports from their own POS (CSV / connectors).

Neither is a fallback for the other.
POS sends ledger facts (gross, base, VAT at the rate charged).
POS never files.
