# Phase 8 Dogfood Runbook

**Status:** Ready to run; requires OpenRouter key, sample PDFs, and a target org in Postgres
**Prepared:** 2026-04-30

## Goal

Measure whether private exemplars improve extraction accuracy on repeated vendors before building more Phase 8 infrastructure.

Success threshold:

- Tier 1 weighted accuracy improves over Tier 0 for at least 2 of 3 repeated-vendor groups.
- No high-criticality field regresses repeatedly across a vendor group.
- If results fail, iterate on exemplar prompt format and vendor identity resolution before Tier 3/Tier 4 work.

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

- `ground-truth.json` — parsed human review truth.
- `tier0-report.md/json` — baseline score.
- `tier1/` — Tier 1 extraction JSONs.
- `tier1-report.md/json` — exemplar-assisted score.
- `delta-report.md/json` — Tier 0 vs Tier 1 delta and regressions.

Do not commit `benchmarks/dogfood/output/` run outputs unless explicitly using a small anonymized fixture for a test.

## Interpretation

Ship-forward signal:

- Repeated vendor improves on weighted score.
- `totalAmount`, `vatAmount`, `vendorTaxId`, and `documentNumber` do not regress.
- Prompt token cost remains acceptable.

Stop-and-fix signal:

- Tier 1 regresses on high-criticality fields.
- Vendor lookup misses most target docs.
- Exemplar prompt repeats exact values but does not teach field semantics.
- Ground truth parsing shows too many manual review ambiguities.
