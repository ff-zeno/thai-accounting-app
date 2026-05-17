# Phase 8 Corrective Learning Dogfood Runbook

**Status:** Confirmed-candidate replay completed; improved weighted lift, residual regressions remain
**Prepared:** 2026-04-30
**Updated:** 2026-05-16

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

## 2026-05-16 Confirmed-Candidate Replay

Run: `benchmarks/dogfood/output/2026-04-30T12-25-17-333Z`

Commands:

```bash
pnpm tsx benchmarks/dogfood/seed-tier1.ts benchmarks/dogfood/output/2026-04-30T12-25-17-333Z --org-id 95aead7c-9942-474f-b48e-2ec5b46f10c9 --dry-run
pnpm tsx benchmarks/dogfood/seed-tier1.ts benchmarks/dogfood/output/2026-04-30T12-25-17-333Z --org-id 95aead7c-9942-474f-b48e-2ec5b46f10c9 --cleanup
pnpm tsx benchmarks/dogfood/seed-tier1.ts benchmarks/dogfood/output/2026-04-30T12-25-17-333Z --org-id 95aead7c-9942-474f-b48e-2ec5b46f10c9
pnpm tsx benchmarks/dogfood/run-tier1.ts benchmarks/dogfood/output/2026-04-30T12-25-17-333Z --org-id 95aead7c-9942-474f-b48e-2ec5b46f10c9
pnpm tsx benchmarks/dogfood/compare.ts benchmarks/dogfood/output/2026-04-30T12-25-17-333Z
```

Seed evidence:

- 4 vendors touched: Ksher, TikTok, FedEx, Photoism.
- 68 exemplars written.
- 8 correction sessions logged.
- 15 active learning candidates seeded.
- 6/6 held-out Tier 1 re-extractions succeeded; FedEx and Photoism currently only have seed docs in this run, so they are not included in held-out delta.

Result:

- Raw: `90.2% -> 89.2%` (`-1.0pp`).
- Weighted: `87.0% -> 91.2%` (`+4.2pp`).
- Ksher: `88.2% -> 86.8%` raw (`-1.5pp`), but high-value `totalAmount` improved on one held-out doc and `vendorName` improved across held-out Ksher docs.
- TikTok: `94.1% -> 94.1%` raw.
- Remaining regressions: repeated Ksher `vendorAddress` language preference, `detectedLanguage`, and one missing `buyerTaxId`.

Interpretation: confirmed corrective candidates improved weighted extraction and fixed the key Ksher `totalAmount` semantic on one held-out doc, but the replay still does not satisfy the full 2-of-3 vendor success threshold because this fixture has held-out comparisons for only Ksher and TikTok. Next Phase 8 work should add more FedEx/Photoism held-out docs and suppress address-language regressions before Phase 8 closeout.

## 2026-05-16 Post-Review Harness Hardening

Claude Companion reviewed the follow-up harness changes and found benchmark-invalidating risks. Fixes now landed:

- Seed selection no longer blindly picks the first sample per vendor. It uses a shared representative selector for seeding and replay exclusion, preferring a Thai-address seed when most samples for that vendor use Thai address text. Current dry-run selects `ksher-02` instead of English-address `ksher-01`.
- `inferDocumentFamily()` is shared by seed and replay scripts, preventing silent family drift.
- Correction interpretation now extracts selector/reject hints per field clause, so a `totalAmount` hint cannot contaminate `vendorAddress` or `buyerTaxId` rules.
- Active `field_exemplar` candidates are not injected as reusable prompt rules. Per-document values like invoice numbers, dates, and totals must not leak from the seed document into held-out prompts.
- Candidate rationale is instruction-sanitized before storage/use, and prompt rendering drops suspicious rationale text.
- Dogfood cleanup also soft-deletes `document_files` rows for dogfood documents. `extraction_log` remains append-only by schema design, so dogfood logs are not deleted.
- `vendorCountry` extraction parsing now normalizes lowercase ISO-2 values and drops malformed country hints instead of failing the whole extraction object.

Verification:

```bash
pnpm tsc --noEmit
pnpm vitest run src/lib/ai/correction-interpreter.test.ts src/lib/ai/extract-document.test.ts src/lib/ai/dogfood-seed-selection.test.ts src/lib/tax/foreign-vendor-tax.test.ts
pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/extraction-correction-learning.db.test.ts src/lib/db/queries/extraction-learning-isolation.db.test.ts
pnpm tsx benchmarks/dogfood/seed-tier1.ts benchmarks/dogfood/output/2026-04-30T12-25-17-333Z --org-id 95aead7c-9942-474f-b48e-2ec5b46f10c9 --dry-run
git diff --check
```

Hardened replay result after cleanup/reseed and stale-output cleanup:

- 6/6 held-out re-extractions succeeded.
- Raw: `90.2% -> 90.2%` (`+0.0pp`).
- Weighted: `87.0% -> 91.7%` (`+4.6pp`).
- Ksher: `88.2% -> 88.2%` raw; TikTok: `94.1% -> 94.1%` raw.
- Improvements: Ksher `vendorName` fixed across held-out docs and `totalAmount` improved on two held-out docs.
- Remaining regressions: Ksher `vendorAddress` still flips between Thai/English address text, `buyerTaxId` is omitted on two docs, and `vendorTaxId` flips to buyer tax ID on one doc.

Interpretation: the hardened harness removed benchmark contamination, preserved weighted improvement, and fixed exact-value prompt leakage, but the closeout gate still fails. The next design step should not be more exemplar prompting. It should add deterministic vendor/customer identity anchoring for bilingual Thai tax invoices, plus more same-vendor FedEx/Photoism samples. FedEx and Photoism still have only one local sample each, so the 2-of-3 repeated-vendor gate cannot be proven yet.

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

Before rerunning, the dogfood harness must model the real product loop. This wiring is now present in `benchmarks/dogfood/seed-tier1.ts` and `benchmarks/dogfood/run-tier1.ts`:

1. Tier 0 extraction.
2. Human correction + optional natural-language explanation.
3. AI interpretation into structured correction candidates.
4. Human confirmation that the document is now correct.
5. Seed private corrective context from confirmed candidates.
6. Re-extract held-out docs.
7. Compare weighted accuracy, high-criticality regressions, and per-field semantic lift.

Verification after harness update:

- `pnpm tsc --noEmit`
- `pnpm tsx benchmarks/dogfood/seed-tier1.ts benchmarks/dogfood/output/2026-04-17T07-05-33-418Z --org-id 95aead7c-9942-474f-b48e-2ec5b46f10c9 --dry-run`
