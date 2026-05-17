# DBD/TFRS CPA Handoff Package

**Status:** Ready for CPA engagement; not implementation-ready
**Prepared:** 2026-04-30
**Desk-check updated:** 2026-05-16
**Purpose:** Give a Thai-licensed CPA a precise artifact request so Phase 12b can implement DBD/TFRS exports against validated facts, not assumptions.

## Official Source Links

- DBD Excel/XBRL manual: `https://efiling.dbd.go.th/efiling-documents/ExcelXBRLManual.pdf` (retrieved 2026-05-16)
- DBD financial-statement filing manual: `https://efiling.dbd.go.th/efiling-documents/01_ManualFN.pdf` (retrieved 2026-05-16 reference URL; CPA must confirm current portal workflow)
- TFAC TFRS for NPAEs page: `https://acpro-std.tfac.or.th/standard/2/-NPAEs` (retrieved 2026-05-16)
- TFAC Q&A page: `https://acpro-std.tfac.or.th/standard/24/คำถาม-คำตอบ-QA` (retrieved 2026-05-16)

## 2026-05-16 Public Refresh Notes

- DBD public manual still shows DBD XBRL in Excel V.2.0: download/open program, enter financial-statement data, validate, convert to XBRL, and submit the `.zip` via DBD e-Filing.
- DBD public manual still requires Java Runtime Environment 8+ for conversion and describes the downloaded package as Excel workbook + Java builder `.jar` + bundled JRE folder.
- TFAC NPAEs page still lists TFRS for NPAEs (ปรับปรุง 2565) for financial statements with periods beginning on or after 1 January 2023.
- TFAC Q&A page is dated 8/05/2569 and warns Q&A guidance is not a standard and can change if facts or standards change. Use it only as interpretive support.

## What We Need From CPA

1. Current DBD e-Filing Excel template for NPAEs, downloaded from an authenticated DBD e-Filing session.
2. Confirmation of the correct taxonomy code for Lumera-like companies, including whether `NPAE_COM-OTH` is correct for normal Thai company/service/commerce cases.
3. Confirmation of which statement form variant Lumera-like companies should use:
   - income statement / comprehensive income presentation,
   - direct vs indirect cash flow,
   - whether retained earnings statement form is acceptable/expected,
   - whether consolidated forms are irrelevant for MVP.
4. Full sheet list and row-level mapping:
   - Thai label
   - English label, if present
   - DBD taxonomy/account code
   - Current/prior period cells
   - Required vs optional rows
   - Sign convention
   - Whether sub-lines are allowed and max count
5. Builder validation rules:
   - Balance sheet equality
   - Cross-sheet ties
   - Required text fields
   - Thai-only cells
   - Rounding tolerances
   - Common rejection messages
6. TFRS for NPAEs note taxonomy:
   - Required for a normal small Thai company
   - Conditional by business activity or balance
   - Source from GL/subledger vs tenant input vs auditor input
   - Thai canonical wording and acceptable English secondary wording
7. Accepted anonymized sample package:
   - Filled DBD Excel workbook
   - Generated XBRL/XML/ZIP if available
   - Auditor-signed PDF if shareable
   - Builder validation screenshots/errors

## Acceptance Criteria

- `docs/_ai_context/dbd-template-schema.json` is updated from placeholder to CPA-validated.
- `docs/_ai_context/tfrs-npaes-notes-taxonomy.json` is updated from placeholder to CPA-validated.
- At least one sample workbook generated from the validated schema passes DBD Builder validation.
- Phase 12b implementation does not begin until these files are validated or a signed owner/CPA deferral narrows scope.

## Files For CPA Review

- `docs/_ai_context/dbd-template-spec.md`
- `docs/_ai_context/dbd-template-schema.json`
- `docs/_ai_context/tfrs-npaes-notes-spec.md`
- `docs/_ai_context/tfrs-npaes-notes-taxonomy.json`

## CPA Review Questions

- Which exact DBD template file should a non-public-interest Thai company use for FY2026?
- Does the DBD template differ by legal form, industry, or standard beyond the taxonomy code?
- Are notes embedded in the DBD Excel template, attached as PDF, or both?
- What minimum note set do auditors normally expect for TFRS for NPAEs small companies?
- Which notes must always be auditor-authored rather than system-generated draft text?
- How should comparative-year data be handled when the system does not contain prior-year GL?
- What are the common DBD Builder failures that software should prevalidate?
- Are there 2026 amendments, notifications, or practice bulletins not visible in the public TFAC pages?
