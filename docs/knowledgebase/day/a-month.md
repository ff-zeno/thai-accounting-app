---
title: A month
description: Capture as it happens. Reconcile in passes. File at month end.
status: canonical
as_of: 2026-08-20
---
# A month

1. **Capture.** Phone photo of a supplier invoice. Bank CSV. POS sales (suite POS or their own POS import). Merchant settlement CSV.
2. **Confirm.** AI extraction is a suggestion. A human accepts it. Nothing posts without that.
3. **Reconcile.** Bank first. Seven-layer cascade, learned aliases, user rules. Then merchant payouts (`gross − fee − fee VAT = net`).
4. **File what applies.** WHT (PND 3 / 53 / 54, 50 Tawi) for this segment. PP30 only if VAT is on.
5. **Lock the period** when it is done.

Failure is silent if we let it be: a missed PP36, input VAT without the supplier invoice, VAT on a net payout. The product’s job is to make those visible at the point they bite.
