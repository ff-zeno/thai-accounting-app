# Research Spike: DBD e-Filing Format + TFRS for NPAEs Note Coverage

**Status:** Active — runs in parallel with today-gap remediation; blocks Phase 12b start
**Owner:** Founder + paid Thai-licensed CPA engagement
**Estimated effort:** 3 weeks minimum calendar (1 week DBD format extraction, 1 week TFRS notes coverage, 1 week Builder/integration validation). Risk: CPA onboarding and async review can consume 6-8 calendar weeks.
**Created:** 2026-04-26 after round-3 review found Phase 12 was hand-waving DBD/TFRS

## Why this exists

Phase 12 (annual close + DBD + CIT) makes two claims that prior reviews flagged as under-spec:

1. "Investigation needed on current 2026 format spec; assume PDF + structured XML per DBD spec."
2. "11 standard notes auto-generated."

Both are research tasks that would otherwise consume Phase 12 weeks — and risk delivering output that either fails DBD validation or is auditor-rejected. Better to do this as a separate spike before Phase 12b enters Week 1.

## DBD e-Filing reality check

The Department of Business Development requires juristic persons to file financial statements via the DBD e-Filing system. Current (2024-2026) reality:

- Filing format is **NOT plain XBRL or plain XML.** It uses an Excel template (DBD's "XBRL-in-Excel V.2.0" mapping) with prescribed sheets, line items, and Thai-language headers.
- Filers download the Excel template per current taxonomy version, populate, then run a Java desktop application called "DBD e-Filing Builder" (Windows) which validates the Excel and converts it to DBD's XBRL XML format.
- The Builder packages the XBRL + auditor-signed PDF + supporting documents into a ZIP, which is then uploaded to DBD's portal.
- Format and Excel template change roughly annually; tenant must use the current year's template.
- TFRS for NPAEs filers use a different Excel template than full-TFRS filers (most of our tenants are NPAEs).

**Implication for the platform:** v1 of Phase 12b is NOT direct push to DBD. It is "fill the Excel template + generate PDF + walk user through Builder." Direct integration is harder than it looks.

## Spike deliverables

### Week 1: DBD format extraction (CPA-led)

- [ ] Engage Thai CPA familiar with DBD e-Filing for NPAEs.
- [ ] Obtain the current 2026 NPAEs Excel template and sample completed filings (anonymized).
- [ ] Document:
  - Sheet structure (BS, P&L, Equity, Cash Flow, Notes — each as separate sheet)
  - Line-item mapping (each row's Thai label, English label, accountcode hint, taxonomy ID)
  - Comparative period rules (current + prior year side by side)
  - Auditor signature requirements (separate PDF, electronic signature spec)
  - Validation rules the Builder enforces (sums, sign conventions, cross-sheet ties)
- [ ] Produce a JSON schema describing the template (so platform code can populate it programmatically).
- [ ] Test cycle: take Lumera's 2025 actuals → fill template → run through Builder → confirm validation passes.

### Week 2: TFRS for NPAEs note coverage (CPA-led)

- [ ] CPA reviews TFRS for NPAEs Revised 2022 + DBD 2024 notification + any 2026 amendments.
- [ ] Documents the **full** required note set per the standard (significantly more than the 11 in the v1 plan):
  - Accounting policy elections (revenue recognition, depreciation method, inventory cost flow, FX policy, lease accounting under Section 14)
  - Comparative-period rules (changes in accounting estimates / errors → restate prior period)
  - Significant judgments and key assumptions
  - Per-account notes (cash, receivables, inventories with cost-flow method, PPE roll-forward, intangibles, payables, provisions, employee benefits, share capital, retained earnings)
  - Revenue disaggregation
  - Income tax components and reconciliation
  - Related-party transactions (parties + nature + amounts)
  - Commitments and contingencies (operating lease commitments, capital commitments, legal claims)
  - Post-balance-sheet events
  - Risk-management notes (liquidity, credit, FX exposure)
- [ ] Per-note: which information comes from GL automatically, which requires tenant input, which requires auditor input.
- [ ] Output: a `notes_taxonomy.json` describing each note, source data path, default text templates (Thai canonical, English secondary), tenant-input fields, auditor-input fields.

### Week 3: Builder validation + integration design

- [ ] How does the platform wire the Excel template population? Likely: server-side .xlsx generation using a library like ExcelJS, populated from the JSON schema + GL queries.
- [ ] How are auditor signatures handled? Auditor uploads signed PDF; platform attaches.
- [ ] How is the Java Builder bridged? v1: download Excel + signed PDF, walk user through manual Builder run + ZIP upload. v2 (much later): if DBD opens an API, direct push.
- [ ] Hard gate: generated `dbd_template_schema.json` must successfully populate a sample Excel file that passes DBD e-Filing Builder validation before Phase 12b is schedulable.

## Output of this spike

- `docs/_ai_context/dbd-template-spec.md` — the extracted DBD template structure with field-level mapping.
- `docs/_ai_context/tfrs-npaes-notes-spec.md` — the note set with source/input fields per note.
- `notes_taxonomy.json` and `dbd_template_schema.json` checked into the repo (data files).
- Updated `phase-12-annual-close-dbd-cit.md` (which we'll split into 12a + 12b) — Phase 12b plan refined with concrete tasks based on actual template structure, not assumed.

## Risk

- **DBD template format may change between spike completion and Phase 12b ship.** Mitigate: re-validate against current template at Phase 12b Week 1.
- **CPA engagement timing.** The right Thai NPAEs-experienced CPA may have a 2-4 week onboarding lead time. Start the conversation now even if formal engagement is week-of.
- **Foreign-language friction.** All DBD documentation is Thai. Auto-translation insufficient; CPA partner translates as part of engagement.
