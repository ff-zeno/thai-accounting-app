# Phase 8 — Corrective Extraction Learning Loop

**Status:** Active implementation — correction-session/candidate loop exists; confirmed-candidate dogfood replay shows weighted lift, deterministic party identity anchors and anchor-aware replay landed, but richer assistant and broader held-out validation remain
**Author:** Claude Opus 4.6
**Date:** 2026-04-15
**Depends on:** Phase 3 (documents-ai), Phase 4 (reconciliation), Phase 7 (ai-batch-matching)
**Related:** `docs/_ai_context/reconciliation-architecture.md`

## Current Source of Truth — 2026-05-01

Phase 8 is no longer framed as "prompt improvement." The product contract is **corrective learning from confirmed review**:

1. AI extracts a document into typed accounting fields.
2. The user corrects fields directly or explains the issue in natural language.
3. AI may help interpret the explanation, but it produces a **structured correction proposal**, not raw prompt text.
4. The user confirms the document is now correct. This confirmation is the trust boundary.
5. The system stores a learning candidate with provenance: original extraction, final confirmed values, optional user explanation, vendor identity, document family hints, affected fields, and extraction log linkage.
6. Candidate learning artifacts are promoted only after scoped validation. They can be private vendor rules, document-family field rules, exemplars, global consensus candidates, or compiled deterministic extractors.
7. Every future extraction records which learned artifacts influenced it, and every artifact can be demoted or retired when corrections show drift.

Natural language is useful because small-business users can say what is wrong without understanding schemas or prompts. It is supporting evidence, not an automatic instruction channel. We do not blindly append user text to prompts, ingest one correction globally, or mutate extraction behavior without confirmation and validation.

## Dogfood Result — 2026-04-30

The first dogfood cycle proved the current Tier 1 mechanism is wired but not robust enough:

- Tier 0 weighted score: **87.5%** across 10 docs.
- Tier 1 held-out comparison: **87.0% → 87.5%** weighted, but raw score regressed **90.2% → 86.3%**.
- Private exemplars fixed Ksher Thai vendor name.
- Private exemplars did **not** teach the important semantic rule: for Ksher settlement receipt/tax invoice docs, `totalAmount` should be gross `Trans. Amount / GrandTotal`, not net `Credit Amount`.
- Tier 1 also caused low/medium regressions (`vendorAddress`, `subtotal`, `buyerTaxId`, `vatRate`, `detectedLanguage`).

Conclusion: before building more tiers, Phase 8 must add a correction-confirmation product loop and structured, scoped learning artifacts. Prompt-only exemplar injection is too weak as the primary abstraction.

## Current Implementation Snapshot — 2026-04-30

This plan predates a large amount of implementation. Treat the sections below as architecture history; use this snapshot and `docs/_ai_context/phase-8-dogfood-runbook.md` as the current source of truth for next work.

Implemented and verified in code:

- Extraction learning tables: `extraction_exemplars`, `vendor_tier`, `extraction_log`, `extraction_review_outcome`, `org_reputation`, `exemplar_consensus`, `global_exemplar_pool`, `extraction_compiled_patterns`.
- Tenant-isolation hardening exists for learning tables through baseline migrations.
- Review save path writes exemplars and review outcomes through `writeReviewExemplars()`. This captures confirmed field values but does not yet capture natural-language correction rationale or structured rule candidates.
- Extraction path probes PDF text-layer vendor identity, resolves private exemplars, injects Tier 1 prompt context, logs extraction tier/usage, and falls back safely. Dogfood shows this mechanism works technically but is semantically underpowered.
- Tier 2 consensus scaffolding exists: org reputation, consensus recompute, global exemplar pool, admin extraction-health dashboard.
- Compiled-pattern scaffolding exists: schema, AST validator, isolated-vm runner, compiler/shadow validation jobs.

## 2026-05-16 Implementation Update

New Phase 8 corrective-learning slice is now implemented and verified:

- Review save path records draft `extraction_correction_sessions` with optional correction note and structured `ai_interpretation`.
- Confirming a reviewed document marks the latest correction session confirmed and emits `learning/review-confirmed`.
- Confirmed sessions promote rule candidates to `shadow`, not active, so no unvalidated user explanation can affect future prompts.
- `activateValidatedLearningCandidates()` is the explicit validation gate from `shadow` to `active`; it records validation evidence and audit log metadata.
- Extraction prompt context loads only active candidates by default; shadow candidates are excluded from runtime prompt injection.
- Tenant-isolation tests now include correction sessions and learning candidates, including write-side cross-org conflict coverage.
- Review findings fixed: unexpected confirm errors propagate, payment + WHT + PP36 materialization are transaction-scoped, and structured candidate upserts guard against cross-org conflict updates.
- Dogfood harness now models the confirmed-correction product loop: `seed-tier1.ts` creates synthetic extraction evidence, confirmed correction sessions, validation-backed active learning candidates, and `run-tier1.ts` injects active candidates into Tier 1 replay context.
- Confirmed-candidate replay was run against `benchmarks/dogfood/output/2026-04-30T12-25-17-333Z`: 4 vendors seeded, 68 exemplars, 8 correction sessions, 15 active candidates, and 6/6 held-out re-extractions succeeded. Weighted accuracy improved `87.0% -> 91.2%`; raw accuracy moved `90.2% -> 89.2%`.

Verified on 2026-05-16:

- `pnpm tsc --noEmit`
- `pnpm vitest run src/lib/ai/correction-interpreter.test.ts src/lib/ai/extract-document.test.ts`
- `pnpm vitest run src/lib/db/queries/payments.test.ts src/lib/db/queries/wht-certificates.test.ts src/lib/tax/foreign-vendor-tax.test.ts src/lib/ai/correction-interpreter.test.ts src/lib/ai/extract-document.test.ts`
- `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/extraction-correction-learning.db.test.ts src/lib/db/queries/extraction-learning-isolation.db.test.ts`
- `pnpm vitest run --config vitest.config.db.ts src/lib/db/queries/foreign-vendor-tax.db.test.ts`
- `pnpm test:e2e e2e/documents/review-learning.spec.ts`
- `pnpm tsx benchmarks/dogfood/seed-tier1.ts benchmarks/dogfood/output/2026-04-17T07-05-33-418Z --org-id 95aead7c-9942-474f-b48e-2ec5b46f10c9 --dry-run`
- Claude Companion adversarial review completed; high findings fixed in this slice.

Known gaps before Phase 8 can be called complete:

- **Naive Tier 1 lift is not proven.** The 2026-04-30 dogfood cycle produced only +0.5pp weighted improvement and raw-score regression. Treat this as a stop-and-redesign signal, not a ship-forward signal.
- **UI coverage remains partial.** Users can save a correction note in the review form, and Playwright now verifies that the save creates a draft correction session. There is still no rich review-chat assistant.
- **Broader dogfood validation still required.** Anchor-aware replay on the available held-out set improved raw `90.2% -> 96.1%` and weighted `87.0% -> 97.2%`, with Ksher `88.2% -> 95.6%` and TikTok `94.1% -> 97.1%`. The fixture still only has held-out Ksher and TikTok docs. FedEx and Photoism have only one local sample each, so they need additional samples before the 2-of-3 repeated-vendor closeout gate can be claimed.
- **Residual regressions are narrowed but not zero.** Deterministic vendor/customer identity anchoring cleared the high-criticality `vendorTaxId` and `buyerTaxId` regressions. Current anchor-aware replay has three lower-criticality regressions: two noisy Ksher `vendorAddress` OCR/language variants and one TikTok `detectedLanguage` classification.
- **Canonical vendor resolver is not the design from this document.** Current path is PDF text-layer `probeVendorIdentity()` plus DB lookup. This is enough for dogfood, but not the full resolver contract.
- **Tier 3 is not product-active.** Compiled pattern code exists, but the extraction path still calls the vision model and does not execute compiled output as the primary extractor.
- **Tier 4 remains deferred.** Do not implement Tier 4 until corrective learning proves lift and Tier 3 has a separate security pass.

## Immediate Decision

Tier 4 stays explicitly deferred. The next task is not more prompt tuning; it is a corrective-learning slice:

1. [x] Add a correction-review model that distinguishes **field value corrections**, **natural-language explanations**, **AI-proposed rules**, and **user-confirmed final document correctness**.
2. [x] Add structured learning candidates scoped by org, vendor, document family, field, and confidence/provenance.
3. [ ] Add a richer review-chat affordance or equivalent correction assistant beyond the current correction-note field. Current v1 correction-note save path has Playwright coverage in `e2e/documents/review-learning.spec.ts`.
4. [x] Promote only confirmed candidates into extraction context after validation. Use private scoped rules before global consensus.
5. [x] Rerun confirmed-candidate dogfood for the current fixture. Result: weighted lift `+4.2pp`, raw `-1.0pp`, 6 regressions remain.
6. [x] Fix benchmark harness bugs found by Claude Companion: representative seed selection, shared seed/replay family inference, per-field hint extraction, no `field_exemplar` prompt injection, rationale sanitization, dogfood file cleanup, and tolerant `vendorCountry` parsing.
7. [x] Rerun hardened live Tier 1 replay after reseeding and compare the new delta report. Result: weighted `87.0% -> 91.7%`, raw `90.2% -> 90.2%`, 6 regressions remain.
8. [x] Add deterministic vendor/customer identity anchoring for bilingual Thai tax invoices before more prompt tuning. Evidence: `ExtractionContext.identityAnchor` now carries matched vendor and tenant organization names, tax IDs, branch numbers, and bilingual addresses into extraction prompts; prompt tests verify Tier 0 anchor behavior, quote-safe formatting, malformed tax/branch filtering, and injection-like value filtering. Claude Companion blocker findings around 50 Tawi buyer semantics and quote-safe anchor formatting were fixed.
9. [x] Rerun anchor-aware held-out replay for the existing fixture. Result: `benchmarks/dogfood/output/2026-04-30T12-25-17-333Z`; 6/6 Tier 1 re-extractions succeeded, raw `90.2% -> 96.1%`, weighted `87.0% -> 97.2%`, Ksher `88.2% -> 95.6%`, TikTok `94.1% -> 97.1%`.
10. [x] Mark the broader FedEx/Photoism held-out closeout gate data-blocked. Current local corpus has only one FedEx and one Photoism sample, so the 2-of-3 repeated-vendor validation gate cannot be proven from local data.
11. [ ] Add more FedEx/Photoism held-out samples when available, then rerun the repeated-vendor validation gate.
12. [ ] If corrective learning improves at least 2 of 3 repeated vendors and no high-criticality field repeatedly regresses, Phase 8 can move to Phase 2 hardening. If not, fix correction artifact design before more infrastructure.

## Review history

**v1 → v2 (2026-04-15)**: Reviewed by two independent passes. `spectre:reviewer` (Opus 4.6, fresh context) and Codex CLI (`gpt-5.3-codex`, high reasoning). GPT-5.4 via OpenRouter was blocked at account level (HTTP 403 Terms of Service flag, unresolved). Findings triaged: 5 BLOCKERs, 12 HIGH, 5 MEDIUM. All BLOCKERs and HIGHs incorporated below. Key changes from v1:
- Section 6.4 sandbox rewritten — `node:vm` replaced with subprocess isolation + `isolated-vm` inner layer, AST allowlist expanded, compile TS → JS at generation time
- Section 5.1–5.7 data model hardened — partial unique indexes for soft-delete, FK enforcement on scope, idempotency keys, split `extraction_log` into append-only log + review outcome, compiled-JS storage
- Section 6.1 write path — idempotency keys, optimistic concurrency, `auditMutation` integration, no hot-path recompute
- Section 6.2 read path — canonical vendor resolver using the actual `vendor_bank_aliases` table (corrected from v1's wrong name)
- Section 6.5 shadow canary — rate scales inversely with volume
- Section 7 Phase 1 scope — vendor resolver and test harness added as prereqs, UI indicator cut, timeline revised 1 week → 2–3 weeks realistic
- Field criticality classification (Section 5.8) drives per-field consensus thresholds
- Velocity gates on global consensus: no contributions within 30 days of account creation, ≥50 docs processed required

## 1. Problem

Our 2026-04-15 extraction benchmark (12 vision models × 4 real Thai documents, scored against Opus 4.6 ground truth) showed:

- Top model (`qwen/qwen3-vl-32b-instruct`) averages **79%** weighted field accuracy. On the structurally ambiguous Ksher settlement PDF, the top score is **48%** — no model correctly identifies which of three plausible numbers on the page is the "invoice total."
- No amount of prompt engineering fixes this for structurally ambiguous vendors. The model has no way to know that "for Ksher, totalAmount = Transaction Amount line, not the Credit Amount line" without being told.
- Correcting the same vendor's extraction manually over and over is a terrible user experience and throws away the signal.
- Generic global SaaS (Mindee, Nanonets) has zero training on Thai-specific vendors like Ksher, KBank, ShopeePay, LINE MAN. This is our competitive moat — *if* we actually build the learning loop.

The 2026-04-30 dogfood run added an important correction: field exemplars alone are not a rich enough learning signal. They can teach exact values or spelling corrections, but they do not reliably teach document semantics such as "gross transaction amount is the accounting total; net credit is settlement cash."

**This phase builds a corrective learning loop.** The user corrects a document and confirms final correctness. Natural-language explanation can help the AI understand why the old extraction was wrong, but the system converts that into structured, scoped learning artifacts before reuse. No user writes regex, edits prompts, or defines templates. The system climbs a ladder of increasingly cheap and accurate extraction strategies as confirmed evidence accumulates, and automatically falls back when drift is detected.

## 2. Goals

1. **Accuracy**: for any vendor/document family a user has corrected and confirmed, subsequent similar docs reach ≥95% weighted field accuracy.
2. **Cost**: for high-volume vendors (≥100 docs processed), extraction cost per document trends toward zero (target: 20× cost reduction vs Tier 0 LLM-only).
3. **Network effect**: new orgs joining the platform benefit from validated extraction patterns learned by earlier orgs, without ever seeing another org's raw documents or corrections.
4. **Resilience**: when a vendor changes their PDF format, the system detects drift within days (not months) and falls back to a higher-cost but more accurate tier until the new format is re-learned.
5. **Auditability**: every extraction logs which tier it used, which learning artifacts influenced it, and (for compiled patterns) which version of which extractor ran. Any output can be traced back to confirmed corrections.
6. **Approachability**: small-business users can explain mistakes in plain language. The product translates that explanation into structured proposals and confirmation gates.

## 3. Non-goals

- **No user-facing rules UI.** Users never write regex, never define templates, never configure field mappings. All learning is implicit from correcting the accounting form.
- **No global model finetuning.** We use in-context learning (few-shot prompts) and offline pattern compilation. We don't train or finetune any model weights.
- **No external training data.** All exemplars come from real user corrections on real documents. We don't crawl, we don't seed, we don't bootstrap from synthetic data.
- **No cross-tenant data leakage**, ever. An org's private corrections are never visible to any other org, even in aggregate form. Global exemplars are derived from corrections but stripped of document-identifying content before promotion.
- **Not replacing human review.** Even at Tier 4, low-confidence extractions still surface to the user. The loop reduces the rate of needed corrections, it doesn't eliminate review.
- **No blind prompt mutation.** User explanations are never appended directly to future prompts. They must become structured, scoped, confirmed learning candidates first.

## 4. Architecture — the corrective learning ladder

Five tiers. Each vendor/document-family scope lives at one tier per scope (org-local or global). Documents route to the highest tier unlocked for the current org and matching document family. Promotion and demotion are automatic, but only confirmed corrections create promotion evidence.

### Tier definitions

| Tier | Strategy | Expected cost/doc | Expected accuracy | When a vendor lives here |
|---|---|---|---|---|
| **0** | Raw vision LLM, no memory | ~$0.0010 | 60–80% | First encounter, no confirmed learning artifact, no fingerprint match |
| **1** | Vision LLM + private corrective context: confirmed values, correction rationales, and scoped field rules | ~$0.0012 | 85–95% | Same org has confirmed corrections for this vendor/document family |
| **2** | Vision LLM + consensus-validated corrective context | ~$0.0012 | 85–95% | Cross-org consensus reached on this vendor/document family without exposing raw docs |
| **3** | Compiled deterministic extractor + small LLM sanity check | ~$0.0003 | 98–99% | ≥20 docs at Tier 2 with stable confirmed patterns, compiled extractor passes shadow validation |
| **4** | Pure deterministic, LLM only as fallback | ~$0.00005 | 99.5%+ | ≥100 docs at Tier 3 with zero regressions |

### Cost trajectory, single vendor

```
docs   1– 10:   Tier 0/1    ~$0.0010/doc    (100% LLM)
docs  11– 50:   Tier 1      ~$0.0012/doc    (LLM + private corrective rules)
docs  51–100:   Tier 2      ~$0.0012/doc    (LLM + consensus corrective rules)
docs 101–500:   Tier 3      ~$0.0003/doc    (compiled + LLM verify)
docs 500+:      Tier 4      ~$0.00005/doc   (pure compiled)
```

Over the lifetime of a single high-volume vendor: cost per doc drops roughly 20×, accuracy climbs from ~70% to ~99.5%. Rare-vendor docs stay near Tier 0 — which is fine, because rare vendors don't drive total spend.

### Promotion rules

Thresholds scale with **field criticality** (see Section 5.8). The base thresholds below apply to low-criticality fields. High-criticality fields (`totalAmount`, `vendorTaxId`, `vatAmount`) require stricter rules.

| From → To | Trigger (base / low criticality) | Trigger (high criticality) |
|---|---|---|
| **0 → 1** | User confirms a corrected document and at least one field/rule candidate is saved for this vendor/document family (org-scoped) | Same, but high-criticality rule candidates start in "shadow guidance" until one held-out similar doc passes |
| **1 → 2** | ≥3 independent orgs with reputation-weighted score ≥3 have confirmed semantically equivalent correction candidates for the same `(vendor_key, document_family, field_name)`, AND no contradicting corrections in the last 30 days | ≥5 independent orgs with reputation-weighted score ≥4, AND one admin confirmation in the extraction-health dashboard, AND no contradicting corrections in the last 30 days |
| **2 → 3** | ≥20 docs processed at Tier 2 with correction rate <5%, AND compiled extractor passes shadow validation at ≥95% field agreement | ≥50 docs at Tier 2, ≥98% shadow agreement, admin confirmation |
| **3 → 4** | ≥100 docs at Tier 3 with zero user corrections over 30 days | ≥500 docs, ≥60-day clean window |

**Velocity gates for global consensus eligibility** (applied before any org's correction counts toward promotion):

1. Org must be ≥30 days old (account creation date)
2. Org must have processed ≥50 documents across its history
3. Org reputation score ≥1.0 (i.e., no net-disputed confirmed corrections on record)

These three gates block trivial account-farming attacks on global consensus.

### Demotion rules

Demotion matters more than promotion. Eager promotion + slow demotion is how you ship stale rules silently for months.

| From → To | Trigger |
|---|---|
| **4 → 3** | Any single user correction on a deterministically-extracted field. `vendor_tier.demotion_trigger_id` records the triggering `extraction_log_id`. |
| **3 → 2** | Shadow LLM disagrees with deterministic extractor on >1% of sampled docs over a rolling 30-day window (minimum sample size 30 — otherwise hold current tier). |
| **2 → 1** | 3+ orgs contradict a global correction artifact within a rolling 30-day window |
| **1 → 0** | Org explicitly "forgets" a vendor, OR private learning artifacts are older than 12 months with no recent usage |

## 5. Data model

The original design named eight learning tables. Corrective learning adds correction sessions and learning candidates before those tables are enough for production use. All org-scoped tables must carry tenant isolation. All monetary and numeric fields follow the existing CLAUDE.md rules (`NUMERIC(14,2)` for amounts, `NUMERIC(5,4)` for rates). All mutations route through the existing `auditMutation` helper in `src/lib/db/helpers/audit-log.ts` — see Section 6.1.

**Current correction-learning update:** the original schema below already has useful primitives (`extraction_exemplars`, `extraction_review_outcome`, `extraction_log`), but it is missing the product-level correction loop. Add these concepts before expanding Tier 2+:

### 5.0A `extraction_correction_sessions`

One row per user review/correction conversation. This is the audit container for direct field edits and natural-language clarification.

Required fields:

- `org_id`, `document_id`, `extraction_log_id`
- `started_by_user_id`, `confirmed_by_user_id`
- `status`: `draft`, `confirmed`, `abandoned`
- `user_explanation`: optional natural-language explanation
- `ai_interpretation`: structured JSON summary of what AI thinks the user meant
- `confirmed_at`
- timestamps + soft delete

The important event is not "user typed a message." The important event is **user confirmed the document is now correct**.

### 5.0B `extraction_learning_candidates`

One row per proposed learning artifact derived from a confirmed correction session.

Required fields:

- `org_id`
- `document_id`
- `correction_session_id`
- `vendor_id` / `vendor_key`
- `document_family`: e.g. `payment_processor_settlement_receipt`, `foreign_ad_invoice`, `customs_duty_invoice`
- `field_name`
- `candidate_type`: `field_exemplar`, `field_rule`, `document_family_rule`, `vendor_rule`
- `ai_value`, `confirmed_value`
- `rationale`: short structured explanation
- `selector_hint`: e.g. `Trans. Amount / GrandTotal`
- `reject_hint`: e.g. `Credit Amount / net settlement`
- `applies_when`: JSON array of observable conditions
- `scope`: `document`, `vendor`, `vendor_document_family`, `global_candidate`
- `status`: `candidate`, `shadow`, `active`, `retired`, `rejected`
- `promotion_evidence`, `retirement_reason`

Example Ksher candidate:

```json
{
  "vendorTaxId": "0105560199507",
  "documentFamily": "payment_processor_settlement_receipt",
  "fieldName": "totalAmount",
  "candidateType": "field_rule",
  "selectorHint": "Trans. Amount / GrandTotal",
  "rejectHint": "Credit Amount / net settlement",
  "appliesWhen": ["contains Commission", "contains Credit Amount", "contains Withholding tax"]
}
```

These candidates can still materialize into `extraction_exemplars` for current Tier 1 code, but the long-term abstraction is a confirmed, scoped correction artifact.

### 5.1 `extraction_exemplars`

One row per `(org, vendor, field)` correction or confirmation. Both user-corrected and AI-correct fields are stored — positive signal is as valuable as negative.

Post-dogfood constraint: exemplars are evidence, not the whole learning model. For semantic document-family behavior, prefer an `extraction_learning_candidates` row that can describe selector/reject hints and applicability conditions.

```sql
CREATE TYPE extraction_field_criticality AS ENUM ('low', 'medium', 'high');

CREATE TABLE extraction_exemplars (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id),
  vendor_key            TEXT NOT NULL,              -- from canonical vendor resolver, see 6.2
  vendor_fingerprint    TEXT,                        -- layout fingerprint hash (Phase 2)
  field_name            TEXT NOT NULL,
  field_criticality     extraction_field_criticality NOT NULL,
  ai_value              TEXT,
  user_value            TEXT,
  was_corrected         BOOLEAN NOT NULL,
  document_id           UUID NOT NULL REFERENCES documents(id),
  source_region         JSONB,
  model_used            TEXT,
  confidence_at_time    NUMERIC(5,4),
  org_reputation_at_time NUMERIC(5,4) NOT NULL,      -- frozen at write time for consensus integrity
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,

  -- Data integrity: was_corrected must be consistent with the values
  CONSTRAINT exemplars_correction_consistency CHECK (
    (was_corrected = true AND ai_value IS DISTINCT FROM user_value) OR
    (was_corrected = false AND ai_value IS NOT DISTINCT FROM user_value)
  )
);

-- Partial unique index: allows re-insertion after soft delete (undo flow)
CREATE UNIQUE INDEX idx_exemplars_unique_active
  ON extraction_exemplars (org_id, vendor_key, field_name, document_id)
  WHERE deleted_at IS NULL;

-- Hot lookup: "top N most recent exemplars for (org, vendor, field)"
CREATE INDEX idx_exemplars_top_recent
  ON extraction_exemplars (org_id, vendor_key, field_name, created_at DESC)
  WHERE deleted_at IS NULL;

-- Layout fingerprint lookup (Phase 2)
CREATE INDEX idx_exemplars_fingerprint
  ON extraction_exemplars (vendor_fingerprint, field_name)
  WHERE deleted_at IS NULL AND vendor_fingerprint IS NOT NULL;
```

### 5.2 `vendor_tier`

Current tier per vendor, per scope. One row per `(vendor_key, scope)`.

```sql
CREATE TYPE vendor_tier_scope_kind AS ENUM ('org', 'global');

CREATE TABLE vendor_tier (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_key            TEXT NOT NULL,
  scope_kind            vendor_tier_scope_kind NOT NULL,
  org_id                UUID REFERENCES organizations(id),     -- set only when scope_kind='org'
  tier                  SMALLINT NOT NULL CHECK (tier BETWEEN 0 AND 4),
  docs_processed_total  INTEGER NOT NULL DEFAULT 0,
  compiled_pattern_id   UUID REFERENCES extraction_compiled_patterns(id),
  last_promoted_at      TIMESTAMPTZ,
  last_demoted_at       TIMESTAMPTZ,
  demotion_trigger_id   UUID REFERENCES extraction_log(id),    -- audit trail for debugging
  last_doc_at           TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Scope integrity: org_id set iff scope_kind='org'
  CONSTRAINT vendor_tier_scope_integrity CHECK (
    (scope_kind = 'org' AND org_id IS NOT NULL) OR
    (scope_kind = 'global' AND org_id IS NULL)
  ),

  -- Tier 3+ requires a compiled pattern to be meaningful
  CONSTRAINT vendor_tier_compiled_required CHECK (
    tier < 3 OR compiled_pattern_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX idx_vendor_tier_unique_scope
  ON vendor_tier (vendor_key, scope_kind, COALESCE(org_id::text, 'global'));

CREATE INDEX idx_vendor_tier_lookup_org
  ON vendor_tier (org_id, vendor_key)
  WHERE scope_kind = 'org';

CREATE INDEX idx_vendor_tier_lookup_global
  ON vendor_tier (vendor_key)
  WHERE scope_kind = 'global';
```

**`correction_rate_30d` is NOT stored.** It is computed at query time from `extraction_log` joined with `extraction_review_outcome`. If it becomes a hotspot, materialize via a nightly Inngest job — never on the hot write path.

### 5.3 `extraction_compiled_patterns`

Compiled Tier 3+ extractors. Generated by LLM-as-compiler from exemplars, validated by shadow execution, loaded and executed at runtime in a strict subprocess sandbox (see Section 6.4).

```sql
CREATE TYPE compiled_pattern_status AS ENUM ('shadow', 'active', 'retired');

CREATE TABLE extraction_compiled_patterns (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_key              TEXT NOT NULL,
  scope_kind              vendor_tier_scope_kind NOT NULL,
  org_id                  UUID REFERENCES organizations(id),
  version                 INTEGER NOT NULL,
  source_ts               TEXT NOT NULL,               -- LLM-generated TypeScript, for audit only
  compiled_js             TEXT NOT NULL,               -- what actually executes
  ts_compiler_version     TEXT NOT NULL,               -- e.g. "typescript@5.7.2"
  ast_hash                TEXT NOT NULL,               -- SHA-256 of the approved AST
  training_set_hash       TEXT NOT NULL,               -- SHA-256 of sorted exemplar IDs
  shadow_accuracy         NUMERIC(5,4),
  shadow_sample_size      INTEGER,
  status                  compiled_pattern_status NOT NULL DEFAULT 'shadow',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at            TIMESTAMPTZ,
  retired_at              TIMESTAMPTZ,
  retirement_reason       TEXT,

  CONSTRAINT compiled_scope_integrity CHECK (
    (scope_kind = 'org' AND org_id IS NOT NULL) OR
    (scope_kind = 'global' AND org_id IS NULL)
  )
);

-- One row per (vendor, scope, version) — immutable once written
CREATE UNIQUE INDEX idx_compiled_patterns_version
  ON extraction_compiled_patterns (vendor_key, scope_kind, COALESCE(org_id::text, 'global'), version);

-- Exactly one active pattern per (vendor, scope) at any time
CREATE UNIQUE INDEX idx_compiled_patterns_single_active
  ON extraction_compiled_patterns (vendor_key, scope_kind, COALESCE(org_id::text, 'global'))
  WHERE status = 'active';
```

**Immutability of `compiled_js`:** once `status='active'`, the row is frozen. Retirement creates a new row with `status='retired'` linked back; promotion of a new version creates a new row with a higher `version`. Application-layer assertion in `src/lib/db/queries/compiled-patterns.ts` enforces this; DB-level trigger added in Phase 3 for defense in depth.

### 5.4 `org_reputation`

Soft trust score per org. Updated when an org's correction is later confirmed or contradicted by consensus.

```sql
CREATE TABLE org_reputation (
  org_id                UUID PRIMARY KEY REFERENCES organizations(id),
  score                 NUMERIC(5,4) NOT NULL DEFAULT 1.0 CHECK (score BETWEEN 0 AND 5),
  corrections_total     INTEGER NOT NULL DEFAULT 0,
  corrections_agreed    INTEGER NOT NULL DEFAULT 0,
  corrections_disputed  INTEGER NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reputation_counts_consistency CHECK (
    corrections_total >= corrections_agreed + corrections_disputed
  )
);
```

Updates happen inside a single transaction via `updateOrgReputation()` in `src/lib/db/queries/org-reputation.ts`. Never two-step update-then-read.

### 5.5 `extraction_log` + `extraction_review_outcome`

**Split into two tables** to preserve append-only semantics. The log row is written by the Inngest extraction step (idempotent via retry-safe deterministic key). The review outcome row is written only when the user saves the review form.

```sql
CREATE TABLE extraction_log (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id             UUID NOT NULL REFERENCES documents(id),
  org_id                  UUID NOT NULL REFERENCES organizations(id),
  vendor_key              TEXT,
  tier_used               SMALLINT NOT NULL,
  exemplar_ids            UUID[],
  compiled_pattern_id     UUID REFERENCES extraction_compiled_patterns(id),
  shadow_run              BOOLEAN NOT NULL DEFAULT false,
  shadow_agreement        NUMERIC(5,4),
  model_used              TEXT,
  input_tokens            INTEGER,
  output_tokens           INTEGER,
  cost_usd                NUMERIC(12,8),
  latency_ms              INTEGER,
  -- Idempotency: deterministic key derived from Inngest event.id + step_id.
  -- Ensures retries upsert instead of duplicating.
  inngest_idempotency_key TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inngest retries land on the same idempotency key → upsert, not duplicate
CREATE UNIQUE INDEX idx_extraction_log_idempotency
  ON extraction_log (inngest_idempotency_key);

CREATE INDEX idx_extraction_log_document
  ON extraction_log (document_id, created_at DESC);

CREATE INDEX idx_extraction_log_vendor
  ON extraction_log (vendor_key, created_at DESC);

-- GIN index for "which docs used exemplar X?" debugging queries.
-- Added in Phase 1 even though not queried yet — cheap to add early, painful to add on a large table.
CREATE INDEX idx_extraction_log_exemplar_ids
  ON extraction_log USING GIN (exemplar_ids);

-- Shadow canary aggregation
CREATE INDEX idx_extraction_log_shadow
  ON extraction_log (shadow_run, created_at DESC)
  WHERE shadow_run = true;

CREATE TABLE extraction_review_outcome (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_log_id       UUID NOT NULL REFERENCES extraction_log(id),
  document_id             UUID NOT NULL REFERENCES documents(id),
  org_id                  UUID NOT NULL REFERENCES organizations(id),
  user_corrected          BOOLEAN NOT NULL,
  correction_count        INTEGER NOT NULL DEFAULT 0,
  reviewed_by_user_id     TEXT NOT NULL,               -- Clerk user ID
  reviewed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One outcome per extraction log row
  UNIQUE (extraction_log_id)
);
```

Both tables are append-only. `extraction_log` is never updated. `extraction_review_outcome` is written once per extraction by the review save action. Historical correction rates are always computable by joining these two tables filtered by time window.

### 5.6 `exemplar_consensus` (Phase 2)

Materialized view of global exemplar candidates. Recomputed by a nightly Inngest cron or triggered by exemplar writes.

```sql
CREATE TABLE exemplar_consensus (
  vendor_key            TEXT NOT NULL,
  field_name            TEXT NOT NULL,
  normalized_value_hash TEXT NOT NULL,                 -- SHA-256 of canonical form
  normalized_value      TEXT NOT NULL,                 -- human-readable canonical form
  weighted_org_count    NUMERIC(8,4) NOT NULL,
  raw_org_count         INTEGER NOT NULL,
  contradicting_orgs    INTEGER NOT NULL DEFAULT 0,
  first_observed_at     TIMESTAMPTZ NOT NULL,
  last_observed_at      TIMESTAMPTZ NOT NULL,
  promoted_to_global    BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (vendor_key, field_name, normalized_value_hash)
);

CREATE INDEX idx_consensus_promotion_candidates
  ON exemplar_consensus (promoted_to_global, last_observed_at DESC)
  WHERE promoted_to_global = false;
```

### 5.7 `global_exemplar_pool` (Phase 2)

The promoted exemplars actually used by Tier 2. Stripped of document-identifying content.

```sql
CREATE TABLE global_exemplar_pool (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_key            TEXT NOT NULL,
  vendor_fingerprint    TEXT,
  field_name            TEXT NOT NULL,
  canonical_value_hash  TEXT NOT NULL,
  canonical_value       TEXT NOT NULL,
  source_exemplar_count INTEGER NOT NULL,
  promoted_at           TIMESTAMPTZ NOT NULL,
  retired_at            TIMESTAMPTZ,
  retirement_reason     TEXT
);

-- Single active canonical value per (vendor, field)
CREATE UNIQUE INDEX idx_global_pool_single_active
  ON global_exemplar_pool (vendor_key, field_name)
  WHERE retired_at IS NULL;

CREATE INDEX idx_global_pool_lookup
  ON global_exemplar_pool (vendor_key, field_name)
  WHERE retired_at IS NULL;
```

### 5.8 Field criticality classification

Hardcoded mapping in `src/lib/ai/field-criticality.ts`. Drives consensus threshold selection in Section 4's promotion rules.

```ts
export type FieldCriticality = 'low' | 'medium' | 'high';

export const INVOICE_FIELD_CRITICALITY: Record<string, FieldCriticality> = {
  // High-stakes: a wrong value here causes real accounting harm
  totalAmount:          'high',
  vendorTaxId:          'high',
  vatAmount:            'high',
  subtotal:             'high',
  buyerTaxId:           'high',

  // Medium: wrong values cause mislabeling but not financial miscalculation
  documentNumber:       'medium',
  issueDate:            'medium',
  dueDate:              'medium',
  vendorName:           'medium',
  vendorNameEn:         'medium',
  buyerName:            'medium',
  vendorBranchNumber:   'medium',

  // Low: easy to fix post-hoc, minimal downstream impact
  currency:             'low',
  vatRate:              'low',
  documentType:         'low',
  detectedLanguage:     'low',
  vendorAddress:        'low',
  confidence:           'low',
  notes:                'low',
};

export const ID_CARD_FIELD_CRITICALITY: Record<string, FieldCriticality> = {
  citizenId:     'high',
  nameTh:        'high',
  nameEn:        'medium',
  address:       'high',      // feeds WHT certificates
  dateOfBirth:   'medium',
  expiryDate:    'low',
};
```

New fields added to the Zod schemas over time are opt-in to this map. Unmapped fields default to `'medium'` via a runtime fallback in the resolver.

## 6. Pipeline integration

### 6.1 Write path — on user save

File: `src/app/(app)/documents/[docId]/review/actions.ts`

The existing `updateDocumentExtraction` server action is extended, not replaced. All new writes go through `auditMutation` per the existing project convention.

Post-dogfood update: the write path must capture **confirmation**, not merely "field changed." Field diffs are necessary but insufficient; the product needs a place for user explanation and AI-proposed structured learning.

On save:

1. **Optimistic concurrency check.** The server action accepts a `documents.updated_at` timestamp from the client (set when the review page was loaded). If the current row's `updated_at` differs, reject with a 409 — "the document was modified elsewhere, reload and try again." Prevents a retrying Inngest extraction from clobbering user edits.
2. **Load the most recent extraction log row for this document** via `SELECT ... FROM extraction_log WHERE document_id = ? ORDER BY created_at DESC LIMIT 1`.
3. **Capture the correction session.** If the user used chat/clarification, store the natural-language explanation and the AI interpretation. If the user only edited fields, create a session with no explanation.
4. **Confirm final correctness.** The review save action must represent that the user is confirming the saved extraction is now correct enough for the document workflow. This is the trust boundary for learning.
5. **Compute the field diff** between the extraction output (captured at extraction time in a new `document_extraction_snapshots` JSONB column, or recovered from the existing `ai_extracted_data` column) and the user's saved values. Normalize both sides using `normalizeFieldValue(field_name, value)` — see the new `src/lib/ai/field-normalization.ts` module.
6. **For each field**, wrapped in a single transaction and routed through `auditMutation`:
   - If unchanged → insert `extraction_exemplars` row with `was_corrected = false`, `ai_value = user_value`
   - If changed → insert `extraction_exemplars` row with `was_corrected = true`, frozen `org_reputation_at_time`
7. **Generate learning candidates** for corrected fields where the system can infer a reusable rule. Natural-language explanations help here, but candidates are structured and scoped. Do not activate them directly.
8. **Insert exactly one `extraction_review_outcome` row** linked to the extraction log, with `user_corrected`, `correction_count`, and `correction_session_id`.
9. **Queue a demotion/promotion check** as a fire-and-forget Inngest event `learning/review-confirmed` with `{org_id, vendor_key, correction_session_id, correction_count}`. The handler evaluates rolling correction rate, candidate consistency, and existing global consensus.
10. **Update `org_reputation` asynchronously** — also in the Inngest handler, not in the hot save path. The reputation update requires comparing this confirmed correction against existing consensus, which is a read-heavy operation.

The hot-path save completes in a single transaction, writes at most N exemplars (where N = number of schema fields in the invoice schema, ~15), one correction session, candidate rows when applicable, plus one outcome row, and emits one event. Everything else is async.

### 6.2 Read path — canonical vendor resolver + corrective context lookup

File: `src/lib/inngest/functions/process-document.ts`

New step `resolve-extraction-context` inserted before `ai-extraction`:

```ts
const context = await step.run("resolve-extraction-context", async () => {
  // 1. Extract candidate vendor_tax_id via cheap heuristic (regex over PDF text layer)
  const candidateTaxId = await extractVendorTaxIdHeuristic(docPages);

  // 2. Run through the canonical vendor resolver (new service, see below)
  const resolved = await resolveVendor({
    taxId: candidateTaxId,
    fingerprint: null, // Phase 2
    orgId: event.data.orgId,
  });
  if (!resolved) return { tier: 0 as const };

  // 3. Look up vendor_tier with precedence: org → global
  const tier = await getVendorTier(resolved.vendorKey, event.data.orgId);
  if (tier.tier < 1) return { tier: 0 as const };

  // 4. Fetch private corrective context.
  //    Phase 1 returns confirmed exemplars plus active/shadow learning candidates.
  const exemplars = await getTopExemplars({
    vendorKey: resolved.vendorKey,
    orgId: event.data.orgId,
    fieldsOfInterest: INVOICE_FIELD_NAMES,
    limit: 3,
  });
  const learningCandidates = await getActiveLearningCandidates({
    vendorKey: resolved.vendorKey,
    orgId: event.data.orgId,
    documentFamily: resolved.documentFamily,
    fieldsOfInterest: INVOICE_FIELD_NAMES,
  });

  // 5. If tier ≥ 3, run the compiled extractor in the subprocess sandbox
  //    (Phase 3 — not in Phase 1 scope)
  let compiledResult: Record<string, unknown> | null = null;
  if (tier.tier >= 3 && tier.compiledPatternId) {
    compiledResult = await runCompiledPatternSandboxed(tier.compiledPatternId, docText);
  }

  return { tier: tier.tier, exemplars, learningCandidates, compiledResult };
});
```

**Canonical vendor resolver** — new service at `src/lib/vendor/resolver.ts`. Single source of truth for vendor identity, used by both extraction and reconciliation. Precedence:

1. `vendor_tax_id + vendor_branch_number` exact match against known vendors in `documents` table (previous extractions from the same vendor)
2. `vendor_bank_aliases` lookup (existing table in `schema.ts` — **not** `vendor_aliases` as the v1 plan mistakenly called it)
3. Fuzzy vendor name match using Postgres trigram (pg_trgm) for vendors with no tax ID (foreign vendors, handwritten receipts)
4. Fallback: use a stable hash of the normalized vendor name as `vendor_key` — creates a consistent ephemeral identity that can be promoted later if a tax ID appears

This resolver is a prerequisite for Phase 1, not a Phase 2 nice-to-have. Writing it first prevents duplicate exemplar buckets for the same real-world vendor.

### 6.3 Extract function signature change

File: `src/lib/ai/extract-document.ts`

```ts
export interface ExtractionContext {
  tier: 0 | 1 | 2 | 3 | 4;
  exemplars?: Array<{
    vendorKey: string;
    fields: Record<string, { aiValue: string | null; userValue: string }>;
    correctedAt: Date;
  }>;
  learningCandidates?: Array<{
    vendorKey: string;
    documentFamily: string | null;
    fieldName: string;
    candidateType: "field_exemplar" | "field_rule" | "document_family_rule" | "vendor_rule";
    selectorHint?: string;
    rejectHint?: string;
    rationale?: string;
    status: "shadow" | "active";
  }>;
  compiledResult?: Record<string, unknown>;
}

export async function extractDocument(
  files: ExtractionFile[],
  orgId?: string,
  context?: ExtractionContext
): Promise<ExtractionResult>
```

When corrective context is present, the system prompt gains scoped, structured guidance:

```
Previous confirmed corrections for this vendor/document family:
Example 1: {"totalAmount": "5350.00", "documentNumber": "IW011-01-05123", ...}
Example 2: {"totalAmount": "4280.00", "documentNumber": "IW011-01-05201", ...}
Example 3: {"totalAmount": "7948.00", "documentNumber": "IW011-01-05298", ...}

Confirmed field rule:
- Scope: Ksher / payment_processor_settlement_receipt
- Field: totalAmount
- Use the value labeled "Trans. Amount" or "GrandTotal".
- Do not use "Credit Amount"; that is net settlement cash after commission/VAT.

Extract the new document using the same field semantics.
```

The natural-language hint is generated from confirmed structured learning candidates, not raw user chat. If no candidate has enough confidence, use the confirmed examples only and keep the candidate in shadow.

### 6.4 Tier 3 compilation + sandbox — REWRITTEN POST-REVIEW

> **Security-critical. Do not deviate from this design without another security pass.**

**Why this rewrite exists:** v1 proposed `node:vm` with an AST allowlist. Two independent reviews flagged this as unsafe. Node.js explicitly documents `vm` as not a security boundary; canonical escapes via `constructor.constructor('return process')()` and prototype-chain walking are still live. `Worker` threads share the V8 heap and are also not a security boundary.

**Production design:**

1. **LLM-as-compiler** — once a vendor has ≥20 Tier 2 exemplars with correction rate <5%, an Inngest job loads the exemplars, partitions 80/20 train/test, and sends to `qwen/qwen3-vl-32b-instruct` (or larger) with the prompt: "Here are 16 documents and their correct extractions. Write a pure TypeScript function `extract(text: string): Record<string, string>` using only regex, string operations, and number parsing. No imports, no network, no filesystem, no eval, no function constructors, no process/global/Reflect access."
2. **AST validation** — use `@babel/parser` to parse the returned source. Walk the AST and **allowlist** only these node types:
   ```
   Program, BlockStatement, ExpressionStatement, ReturnStatement,
   VariableDeclaration, VariableDeclarator, FunctionDeclaration,
   FunctionExpression, ArrowFunctionExpression,
   IfStatement, SwitchStatement, SwitchCase, ForStatement, ForOfStatement,
   WhileStatement, TryStatement, CatchClause, ThrowStatement, BreakStatement,
   ContinueStatement,
   Identifier, StringLiteral, NumericLiteral, BooleanLiteral, NullLiteral,
   TemplateLiteral, TemplateElement, RegExpLiteral,
   ArrayExpression, ObjectExpression, ObjectProperty, Property,
   BinaryExpression, LogicalExpression, UnaryExpression, UpdateExpression,
   ConditionalExpression, AssignmentExpression,
   CallExpression, MemberExpression
   ```
   Any other node type → reject.

3. **Denylist checks** on allowed nodes:
   - `MemberExpression` with computed property access (`obj[expr]`) → **reject** unless `expr` is a `StringLiteral` or `NumericLiteral`
   - Any `Identifier` named `constructor`, `prototype`, `__proto__`, `process`, `global`, `globalThis`, `Function`, `eval`, `require`, `import`, `Reflect`, `Proxy`, `WeakRef`, `FinalizationRegistry`, `Buffer` → **reject**
   - `CallExpression` callee must resolve to one of an explicit allowlist: `String.prototype.{match, replace, slice, substring, substr, indexOf, lastIndexOf, split, trim, toLowerCase, toUpperCase, startsWith, endsWith, includes, padStart, padEnd, repeat, normalize}`, `Array.prototype.{map, filter, slice, includes, indexOf, find, some, every, join, reduce}`, `RegExp.prototype.{test, exec}`, `Number`, `parseFloat`, `parseInt`, `isNaN`, `isFinite`, `Math.{abs, round, floor, ceil, min, max, pow}`, `Object.keys`, `Object.values`, `Object.entries`, `JSON.parse`, `JSON.stringify`
   - Any `RegExpLiteral` is run through a catastrophic-backtracking guard (`safe-regex` or equivalent) → reject unsafe regexes

4. **TypeScript → JavaScript compilation** — if the AST passes, compile the TypeScript source to JavaScript using the project's `typescript` package with strict settings. Hash the compiled JS with SHA-256 → `ast_hash`. **Store the compiled JS as `compiled_js`** in `extraction_compiled_patterns`. The TypeScript source is kept in `source_ts` for audit but **never executed**.

5. **Subprocess sandbox execution** — compiled JS runs in a separate Node.js subprocess spawned via `child_process.spawn` with:
   - **Linux:** `bubblewrap` wrapper with `--unshare-all --ro-bind / / --tmpfs /tmp --chdir /tmp --die-with-parent` — no network namespace, no mount beyond read-only root + tmpfs, dies when parent dies
   - **Memory limit:** `--max-old-space-size=64` (64 MB heap cap)
   - **CPU limit:** external `timeout 0.1` wrapper (100ms hard kill)
   - **Filesystem:** none writable beyond tmpfs
   - **Network:** no network namespace
   - **Inner layer:** inside the subprocess, the compiled JS runs in an `isolated-vm` `Isolate` with 32 MB memory limit and no inherited context. This is defense-in-depth; the subprocess isolation is the primary boundary, `isolated-vm` is the secondary.

6. **Message protocol** — the parent sends the document text via stdin as a length-prefixed JSON message. The subprocess reads stdin, runs the extractor, writes the result as length-prefixed JSON to stdout, and exits. Any output to stderr, non-zero exit, or timeout → fail-closed (tier demotes to 2, compiled pattern retires).

7. **Subprocess pool** — for cost, keep a pool of 2–4 pre-warmed subprocesses per worker. Each subprocess handles exactly one extraction then exits (no reuse). Pre-warming amortizes spawn cost.

8. **Shadow validation** — the compiled extractor runs against the 4 held-out test exemplars. If ≥95% field agreement → store with `status='shadow'`. Shadow mode: for the next 10 real extractions from that vendor, run both the compiled extractor AND the full LLM in parallel. If agreement stays ≥95% → promote to `status='active'` and set `vendor_tier.tier = 3`. If agreement drops → retire the compiled pattern, return vendor to Tier 2.

9. **Manual review queue for the first 100 compiled patterns in production.** Even if they pass all automated checks, a human reviews the generated code before it goes `active`. After 100, trust the pipeline and let it run autonomously.

### 6.5 Shadow canary runs (Tier 3/4) — REVISED

**Rate formula:** `canary_rate = clamp(5 / daily_doc_count_for_this_vendor, 0.005, 0.20)`

- At 25 docs/day: 20% (5 canaries/day minimum)
- At 100 docs/day: 5%
- At 1000 docs/day: 0.5%
- At 10000 docs/day: 0.05% (floored at 5 canaries/day absolute minimum via separate check)

Minimum absolute canary count per 30-day window: 30 runs. Below that threshold, demotion decisions are held off — insufficient data.

Cost is trivial: at the top end (~$0.0006/call × 30 canaries/day × 30 days = $0.54/vendor/month).

Canary results are logged but never shown to the user. Aggregated in `extraction_log` by `shadow_run=true`. A nightly Inngest job computes rolling 30-day agreement and triggers demotion if Tier 3 drops below 98% or Tier 4 drops below 99%.

## 7. Phase 1 — Private Corrective Learning (MVP)

Phase 1 scope is the minimum slice that produces the measurable lift we need. The original "private exemplars only" slice is no longer enough after dogfood. Phase 1 must include confirmed correction sessions and private structured learning candidates.

### 7.0 Prerequisites (must ship before any Phase 1 feature code)

**P0.1 — Canonical vendor resolver service** (`src/lib/vendor/resolver.ts`, ~3 days)

- New service that both extraction and reconciliation use
- Precedence chain: exact tax_id + branch → `vendor_bank_aliases` → pg_trgm fuzzy name → normalized-name hash fallback
- Contract: returns `{ vendorKey: string, confidence: number }`
- Tests in `src/tests/lib/vendor/resolver.test.ts`
- Also audits via the existing `auditMutation` helper

Without this, Phase 1 will silently create duplicate exemplar buckets for the same real-world vendor.

**P0.2 — Integration test harness** (`src/tests/lib/inngest/harness.ts`, ~2 days)

- Current test infrastructure is limited (`src/tests/db-test-utils.ts` only)
- Phase 1 needs integration tests covering: retry idempotency, duplicate-save upsert, optimistic concurrency failures, vendor-tier math, multi-tenant leakage
- Harness provides: test Inngest function runner, ephemeral DB transaction wrapper, fake Clerk user injection, helper to simulate retries

Without this, the Phase 1 success metric cannot be verified programmatically.

**P0.3 — Field normalization module** (`src/lib/ai/field-normalization.ts`, ~1 day)

- Defines `normalizeFieldValue(field_name, value)` per field type:
  - Amounts: strip commas and whitespace, parse to number, re-serialize at 2 decimals
  - Dates: parse any recognized format, output ISO-8601
  - Tax IDs: strip separators, validate Thai 13-digit checksum, preserve foreign IDs as-is
  - Text: trim, collapse whitespace, unicode NFC normalize, case-preserve
  - Null / undefined / empty string → all treated as "missing", semantically equivalent
- Used by the diff logic in Section 6.1 and the consensus compute in Section 6 Phase 2
- Without this, the Phase 1 diff logic will over-count "corrections" that are just whitespace or formatting differences

### 7.1 Phase 1 feature scope

**What ships:**
- Tiers 0 and 1 only, private org-scoped corrective learning only
- Correction sessions: direct edits and optional natural-language explanation
- AI interpretation of correction explanations into structured proposals
- User confirmation that final extracted data is correct
- Private learning candidates for field exemplars and scoped field rules
- Tier 1 context injection from confirmed examples and active/shadow field rules
- No cross-org logic (no Tier 2)
- No compiled patterns (no Tier 3)
- No layout fingerprints (vendor resolver uses tax ID + alias + fuzzy name only)
- No shadow canary runs
- No broad app copilot. Extraction correction chat belongs here; general AI chat/MCP actions belong to Phase 16.

**Files touched:**

1. `src/lib/vendor/resolver.ts` — new, P0.1
2. `src/tests/lib/vendor/resolver.test.ts` — new, P0.1
3. `src/tests/lib/inngest/harness.ts` — new, P0.2
4. `src/lib/ai/field-normalization.ts` — new, P0.3
5. `src/lib/ai/field-criticality.ts` — new (hardcoded map from Section 5.8)
6. `src/lib/db/schema.ts` — extend with new tables + relations
7. `drizzle/XXXX_extraction_learning_loop.sql` — new migration
8. `drizzle/meta/_journal.json` + `drizzle/meta/XXXX_snapshot.json` — regenerated
9. `src/lib/db/queries/extraction-correction-sessions.ts` — new — create/update/confirm sessions, routed through `auditMutation`
10. `src/lib/db/queries/extraction-learning-candidates.ts` — new — candidate CRUD + promotion/demotion, routed through `auditMutation`
11. `src/lib/db/queries/extraction-exemplars.ts` — existing/new — CRUD + top-N lookup, routed through `auditMutation`
12. `src/lib/db/queries/vendor-tier.ts` — new — read/upsert, tier transition events, routed through `auditMutation`
13. `src/lib/db/queries/extraction-log.ts` — new — idempotent insert with Inngest key
14. `src/lib/db/queries/extraction-review-outcome.ts` — new — one-row-per-log insert
15. `src/lib/db/queries/org-reputation.ts` — new — transactional update helper
16. `src/lib/inngest/functions/process-document.ts` — add `resolve-extraction-context` step, integrate vendor resolver
17. `src/lib/inngest/functions/review-confirmed-handler.ts` — new Inngest function, handles the `learning/review-confirmed` event (candidate checks, reputation update, demotion check)
18. `src/lib/inngest/events.ts` (or existing events file) — add `learning/review-confirmed` event type
19. `src/lib/ai/extract-document.ts` — accept `context: ExtractionContext`, inject confirmed corrective context
20. `src/lib/ai/correction-interpreter.ts` — new — turns user explanation + field diffs into structured learning candidates
21. `src/app/(app)/documents/[docId]/review/actions.ts` — on save, compute normalized diff, write correction session + exemplars + candidates + outcome, emit event. Accept and check `updated_at` for optimistic concurrency.
22. `src/app/(app)/documents/[docId]/review/correction-chat.tsx` — new or equivalent inline assistant for extraction correction only
23. `src/tests/lib/db/queries/extraction-correction-sessions.test.ts` — new
24. `src/tests/lib/db/queries/extraction-learning-candidates.test.ts` — new
25. `src/tests/lib/db/queries/extraction-exemplars.test.ts` — new
26. `src/tests/lib/db/queries/vendor-tier.test.ts` — new
27. `src/tests/lib/inngest/functions/process-document-corrective-context.test.ts` — new — integration test: extract, correct, confirm, re-extract, assert lift
28. `src/tests/lib/inngest/functions/review-confirmed-idempotency.test.ts` — new — retries must upsert, not duplicate
29. `src/tests/lib/inngest/functions/multi-tenant-leakage.test.ts` — new — org A's candidates/exemplars must never appear in org B's extraction context

**Success metric for Phase 1:**

> For any org that re-encounters a vendor/document family they've corrected and confirmed before, the field correction rate on subsequent similar docs drops by ≥50% within 10 documents, with no repeated high-criticality regression.

Measured on a staging org with real Thai docs: 10 Ksher + 10 Fedex + 10 TikTok processed through extraction → user correction/explanation → confirmation → re-extraction. Correction rate comparison: docs 1–5 vs docs 6–10, per vendor/document family. Target: correction rate drops from ~50% on doc 1 to <25% on doc 10 for at least 2 of 3 vendors.

If this lift doesn't materialize: Phase 2 is dead. Iterate on correction artifact design, scoping, candidate interpretation, or model choice before building further.

**Estimated effort:** **2–3 weeks** for a single engineer.

- Prerequisites (P0.1 + P0.2 + P0.3): 1 week
- Core feature (write path + correction sessions + candidates + read path + diff logic + exemplar queries): 1 week
- Integration tests + staging dogfood + measurement: 3–5 days

The 1-week estimate in v1 was unrealistic for a production-quality ship on this codebase. Codex review flagged this explicitly; accepting the revised estimate.

## 8. Phase 2 — Consensus corrective artifacts (sketch)

Builds on Phase 1. Unlocks the network effect.

- Add or adapt `exemplar_consensus` and `global_exemplar_pool` into consensus artifacts for confirmed exemplars and scoped correction rules (Section 5.6, 5.7)
- Nightly Inngest cron recomputes consensus
- Reputation score tracking (`org_reputation` table from Phase 1, with cross-org update logic added)
- Promotion pipeline: private → candidate → shadow validation → global
- Tier 1 → Tier 2 transition in the read path
- Velocity gates enforced at consensus compute time (30-day age, 50-doc minimum)
- Field criticality drives per-field consensus thresholds
- Admin dashboard at `src/app/(app)/admin/extraction-health/` — pool size, promotion/demotion events, reputation histogram
- "Learning from your corrections" UI indicator ships here

**Estimated effort:** ~1.5 weeks after Phase 1 is measured and lift is confirmed.

## 9. Phase 3 — Compiled patterns (sketch)

Only after Phases 1–2 are stable and we have enough exemplar volume to compile.

- Add `extraction_compiled_patterns` table (Section 5.3)
- Inngest job: LLM compile candidate → AST allowlist + denylist validation → TS → JS compilation → shadow run → promote
- Subprocess sandbox runner with `bubblewrap` (Linux) / equivalent (macOS for local dev) + `isolated-vm` inner layer
- Manual review queue for first 100 compiled patterns in production
- Tier 2 → Tier 3 transition
- Shadow canary with volume-scaled rate

**Estimated effort:** ~3 weeks after Phase 2 is healthy. Sandbox work is the long pole.

## 10. Phase 4 — Tier 4 + autonomous drift detection (sketch)

Triggered organically once Tier 3 is proven. Mainly automation of the shadow canary system, drift demotion workflow, and slow auto-promotion of high-volume stable patterns.

## 11. Invariants (must hold at all times)

1. **Private always wins.** An org's own confirmed correction artifacts override global consensus for that org. No exceptions.
2. **All mutations route through `auditMutation`.** Matches existing project pattern. Non-negotiable per CLAUDE.md rule.
3. **`extraction_log` is append-only.** Never updated after write. Review outcomes live in `extraction_review_outcome`, one row per log row.
4. **Inngest idempotency.** Every insert from an Inngest step uses a deterministic idempotency key (event.id + step_id). Retries upsert, never duplicate.
5. **Optimistic concurrency on user save.** Server action requires the client's `documents.updated_at` and rejects stale saves. A retrying extraction cannot overwrite user edits.
6. **Compiled code runs in a subprocess sandbox**, not `node:vm`, not a Worker thread. OS-level isolation is the security boundary; `isolated-vm` inside is defense-in-depth.
7. **Every extraction logs its tier, corrective artifacts, and compiled pattern ID (if any).** `extraction_log` is the single source of truth for audit. A `demotion_trigger_id` FK from `vendor_tier` to the specific triggering log row is the forensic chain.
8. **Global artifacts are stripped of document content.** Global pools contain canonical field values and scoped rule hints only — no doc IDs, no bbox, no source org IDs. A pool leak exposes vendor-field patterns, not customer documents.
9. **Reputation is earned, not granted.** New orgs start at reputation 1.0. Reputation only moves based on consensus agreement/disagreement on the org's own past corrections. No admin toggles.
10. **Velocity gates for global consensus.** Org must be ≥30 days old AND have processed ≥50 docs AND hold reputation ≥1.0 before its corrections count toward promotion.
11. **Field criticality drives consensus thresholds.** High-criticality fields (`totalAmount`, `vendorTaxId`, `vatAmount`) require stricter consensus (5 orgs + admin confirmation). Low-criticality fields (`currency`, `documentType`) use the base threshold.
12. **Demotion is cheaper than promotion.** Single-signal demotion protects us from noise. Demotion trigger is always logged with a FK to the triggering evidence.
13. **Cross-tenant safety trumps network effect.** If we can't prove an exemplar doesn't leak between orgs, we don't promote it. Better slow learning than a privacy incident.

## 12. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| LLM-generated compiled patterns contain security exploits | **Critical** | Subprocess isolation (bubblewrap / equivalent), AST allowlist + denylist, catastrophic-backtracking regex guard, `isolated-vm` inner layer, 100ms hard kill, manual review queue for first 100 patterns in production, fail-closed on any exception |
| Global exemplars poison new orgs with incorrect patterns | **High** | Consensus threshold scales with field criticality, velocity gates (30-day + 50-doc + reputation ≥1.0), reputation weighting, shadow validation before activation, per-org private override always wins |
| Coordinated attack using 3 colluding new accounts | **High** | Velocity gates block this path entirely — new accounts can't contribute for 30 days + 50 docs |
| Vendor identity fragmentation: tax ID missing or wrong on some docs | **Medium** | Canonical vendor resolver (Section 6.2) with 4-level fallback chain; Phase 2 adds layout fingerprint |
| Drift undetected for weeks — vendor silently returning wrong data | **Medium** | Shadow canary with volume-scaled rate and minimum 30 observations per 30-day window before demotion decisions |
| Inngest retry duplicates exemplars or log rows | **High** | Deterministic idempotency keys (`event.id + step_id`) with unique constraints at DB layer |
| User save race with retrying extraction overwrites user edits | **High** | Optimistic concurrency check via `documents.updated_at` |
| `correction_rate_30d` recompute races on hot path | **Medium** | Not stored — computed at query time from `extraction_log` + `extraction_review_outcome` |
| Exemplar selection picks bad training examples, hurts few-shot performance | **Medium** | Always prefer most recent exemplars; cap injection at 3; A/B test selection heuristics in Phase 2 |
| Cost of shadow canaries eats the savings at scale | **Low** | Volume-scaled rate; at the top end ~$0.54/vendor/month |
| First-user cold start — no exemplars for new Thai vendor means no learning | **Expected** | This is the baseline state the system is escaping from, not a regression |
| Consensus too slow — high-value patterns take weeks to promote | **Medium** | Field criticality gives low-risk fields fast thresholds; high-risk fields are intentionally slow |
| Duplicate exemplar buckets for the same vendor under different keys | **Medium** | Canonical vendor resolver prerequisite blocks this path |

## 13. Open questions (post-review update)

**Resolved by prerequisites** (moved from open to required-before-Phase-1):
- ~~Q1 (semantic equivalence)~~ → P0.3 field normalization module
- ~~Q4 (vendor_aliases integration)~~ → P0.1 canonical vendor resolver service

**Still open:**

1. **`vendor_key` fallback when tax ID and layout fingerprint both fail.** Tentative: the resolver's level-4 fallback (normalized-name hash) handles this. Validate in Phase 2.
2. **Per-field reputation.** An org might be accurate on `totalAmount` but bad on `vendorTaxId`. Global reputation may be too coarse. Defer until Phase 2 metrics show this matters, then add a `corrections_by_field_criticality` JSONB column to `org_reputation`.
3. **Multi-currency / multi-country documents.** The TikTok benchmark sample exposed the Singapore GST tax ID issue. Should international vendors live in a separate namespace? Probably yes for Phase 2. The resolver should detect non-Thai tax ID format and set `vendor_key` into a separate namespace.
4. **Compiled extractor IP.** If we auto-generate a regex extractor from 20 orgs' corrected docs, who owns it? Legal question, not architectural. Flag for discussion before Phase 3 ships.
5. **Shadow canary funding at scale.** Volume-scaled rate keeps costs bounded, but at 10k orgs the absolute cost grows. Treat as a budget-managed Inngest step with an org-level cap.

## 14. Out of scope (explicitly)

- Replacing the review UI or accounting form
- Adding a rules editor or template picker (explicit non-goal)
- Training or finetuning any model weights (explicit non-goal)
- Seeding exemplars from external datasets (explicit non-goal)
- Learning from anything other than user saves on the review form
- PDF text layer extraction as a Tier −1 (below LLM) — possible future optimization
- User-facing "learning" UI indicator — pushed to Phase 2

## 15. Metrics and monitoring (must exist before Phase 2 ships)

1. **Per-vendor dashboard card**: current tier, docs processed total, correction rate 30d (computed live), cost trend
2. **Global extraction health**: avg tier across all vendors (weighted by doc volume), cost per doc trend, correction rate as accuracy proxy
3. **Consensus pipeline health**: candidates in shadow, promoted this week, demoted this week, average time-to-promote
4. **Shadow canary agreement**: rolling 30-day % agreement at Tier 3 and Tier 4, sample size per window
5. **Reputation distribution**: histogram of org reputation scores; flag outliers
6. **Compiled pattern inventory**: count active, count shadow, count retired, avg shadow accuracy
7. **Idempotency health**: count of Inngest retries that hit the idempotency key (duplicates prevented)
8. **Optimistic concurrency rejections**: count of 409s from stale saves — if this spikes, something is wrong upstream

All surfaced in an admin dashboard at `src/app/(app)/admin/extraction-health/`. Protected by admin-only auth.

## 16. Ship order (Phase 1)

**Week 1 — Prerequisites:**
1. P0.1 canonical vendor resolver + tests
2. P0.2 integration test harness
3. P0.3 field normalization module + tests

**Week 2 — Core feature:**
4. Drizzle migration + schema.ts extensions + meta snapshot
5. Query layer (correction sessions, learning candidates, exemplars, vendor-tier, extraction-log, review-outcome, org-reputation) with `auditMutation` wiring
6. Write path in `review/actions.ts` with optimistic concurrency and confirmation semantics
7. Correction interpreter for natural-language explanations
8. Read path: `resolve-extraction-context` step in `process-document.ts`
9. Corrective context injection in `extract-document.ts`
10. `review-confirmed-handler` Inngest function

**Week 3 — Tests + staging:**
11. Integration tests (retry idempotency, multi-tenant leakage, lift verification)
12. Staging dogfood with 10 Ksher + 10 Fedex + 10 TikTok documents
13. Measure Phase 1 success metric
14. If lift confirmed → Phase 2 planning. If not → iterate on correction artifact design / scoping / model choice.

No production ship of Phase 1 until the staging lift is proven.
