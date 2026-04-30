# DBD/TFRS CPA Handoff Package

**Status:** Draft for CPA engagement; not implementation-ready
**Prepared:** 2026-04-30
**Purpose:** Give a Thai-licensed CPA a precise artifact request so Phase 12b can implement DBD/TFRS exports against validated facts, not assumptions.

## Official Source Links

- DBD Excel/XBRL manual: `https://efiling.dbd.go.th/efiling-documents/ExcelXBRLManual.pdf`
- DBD financial-statement filing manual: `https://efiling.dbd.go.th/efiling-documents/01_ManualFN.pdf`
- TFAC TFRS for NPAEs page: `https://acpro-std.tfac.or.th/standard/2/-NPAEs`
- TFAC Q&A page: `https://acpro-std.tfac.or.th/standard/24/คำถาม-คำตอบ-QA`

## What We Need From CPA

1. Current DBD e-Filing Excel template for NPAEs, downloaded from an authenticated DBD e-Filing session.
2. Confirmation of the correct taxonomy code for Lumera-like companies, including whether `NPAE_COM-OTH` is correct for normal Thai company/service/commerce cases.
3. Full sheet list and row-level mapping:
   - Thai label
   - English label, if present
   - DBD taxonomy/account code
   - Current/prior period cells
   - Required vs optional rows
   - Sign convention
   - Whether sub-lines are allowed and max count
4. Builder validation rules:
   - Balance sheet equality
   - Cross-sheet ties
   - Required text fields
   - Thai-only cells
   - Rounding tolerances
   - Common rejection messages
5. TFRS for NPAEs note taxonomy:
   - Required for a normal small Thai company
   - Conditional by business activity or balance
   - Source from GL/subledger vs tenant input vs auditor input
   - Thai canonical wording and acceptable English secondary wording
6. Accepted anonymized sample package:
   - Filled DBD Excel workbook
   - Generated XBRL/XML/ZIP if available
   - Auditor-signed PDF if shareable
   - Builder validation screenshots/errors

## Acceptance Criteria

- `docs/_ai_context/dbd-template-schema.json` is updated from placeholder to CPA-validated.
- `docs/_ai_context/tfrs-npaes-notes-taxonomy.json` is updated from placeholder to CPA-validated.
- At least one sample workbook generated from the validated schema passes DBD Builder validation.
- Phase 12b implementation does not begin until these files are validated or a signed owner/CPA deferral narrows scope.

## CPA Review Questions

- Which exact DBD template file should a non-public-interest Thai company use for FY2026?
- Does the DBD template differ by legal form, industry, or standard beyond the taxonomy code?
- Are notes embedded in the DBD Excel template, attached as PDF, or both?
- What minimum note set do auditors normally expect for TFRS for NPAEs small companies?
- Which notes must always be auditor-authored rather than system-generated draft text?
- How should comparative-year data be handled when the system does not contain prior-year GL?
- What are the common DBD Builder failures that software should prevalidate?
- Are there 2026 amendments, notifications, or practice bulletins not visible in the public TFAC pages?
