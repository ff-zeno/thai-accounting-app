# Phase 8 Corrective Learning Dogfood Runbook

**Status:** Dogfood v1 completed; redesign needed before next run
**Prepared:** 2026-04-30
**Updated:** 2026-05-01

## Goal

Measure whether confirmed corrective learning improves extraction accuracy on repeated vendor/document-family docs before building more Phase 8 infrastructure.

Success threshold:

- Tier 1 weighted accuracy improves over Tier 0 for at least 2 of 3 repeated vendor/document-family groups.
- No high-criticality field regresses repeatedly across a vendor group.
- If results fail, iterate on correction artifact design, scoping, candidate interpretation, and vendor identity resolution before Tier 3/Tier 4 work.

## 2026-04-30 Result

Naive private exemplar prompting did not prove the gate:

- Tier 0 weighted: `87.5%`
- Held-out comparison: `87.0% -> 87.5%` weighted, but raw `90.2% -> 86.3%`
- Ksher vendor name improved.
- Ksher `totalAmount` semantics did not improve; model still used net `Credit Amount` instead of gross `Trans. Amount / GrandTotal`.
- Some low/medium fields regressed.

Conclusion: do not continue by micro-tuning prompt text. Add confirmed correction sessions and structured learning candidates first.

## Inputs

- `.env.local` with `OPENROUTER_API_KEY`.
- Local sample files under `_sample_file_types/`.
- Running app/test database with an org UUID to seed dogfood exemplars.
- Curated sample list in `benchmarks/dogfood/run-tier0.ts`.

## Commands

1. Run Tier 0 extraction:

```bash
pnpm tsx benchmarks/dogfood/run-tier0.ts
```

2. Fill the generated review file:

```text
benchmarks/dogfood/output/<run-id>/review.md
```

3. Run the dogfood cycle:

```bash
pnpm tsx benchmarks/dogfood/cycle.ts benchmarks/dogfood/output/<run-id> --org-id <org-uuid>
```

Useful resume flags:

```bash
pnpm tsx benchmarks/dogfood/cycle.ts benchmarks/dogfood/output/<run-id> --org-id <org-uuid> --skip parse --skip score-tier0
pnpm tsx benchmarks/dogfood/seed-tier1.ts benchmarks/dogfood/output/<run-id> --org-id <org-uuid> --cleanup
```

## Outputs

- `ground-truth.json` — parsed human-confirmed review truth.
- `tier0-report.md/json` — baseline score.
- `tier1/` — Tier 1 extraction JSONs.
- `tier1-report.md/json` — exemplar-assisted score.
- `delta-report.md/json` — Tier 0 vs Tier 1 delta and regressions.

Do not commit `benchmarks/dogfood/output/` run outputs unless explicitly using a small anonymized fixture for a test.

## Interpretation

Ship-forward signal:

- Repeated vendor improves on weighted score.
- `totalAmount`, `vatAmount`, `vendorTaxId`, and `documentNumber` do not regress.
- Corrective context teaches field semantics, not only exact prior values.
- Prompt token cost remains acceptable.

Stop-and-fix signal:

- Tier 1 regresses on high-criticality fields.
- Vendor lookup misses most target docs.
- Exemplar/corrective context repeats exact values but does not teach field semantics.
- Ground truth parsing shows too many manual review ambiguities.

## Next Dogfood Shape

Before rerunning, update the dogfood harness to model the real product loop:

1. Tier 0 extraction.
2. Human correction + optional natural-language explanation.
3. AI interpretation into structured correction candidates.
4. Human confirmation that the document is now correct.
5. Seed private corrective context from confirmed candidates.
6. Re-extract held-out docs.
7. Compare weighted accuracy, high-criticality regressions, and per-field semantic lift.
