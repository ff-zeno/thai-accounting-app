# DBD Template Spec — Public Desk-Check

**Status:** Pending CPA + DBD Builder validation
**Prepared:** 2026-05-01
**Purpose:** Capture the public-source DBD e-Filing facts that Phase 12b can use for shape, while blocking implementation on authenticated template and Builder validation.

## Official Sources

- DBD XBRL-in-Excel manual: `https://efiling.dbd.go.th/efiling-documents/ExcelXBRLManual.pdf`
- DBD financial-statement filing manual: `https://efiling.dbd.go.th/efiling-documents/01_ManualFN.pdf`

## Confirmed From Public DBD Docs

- The DBD workflow is still Excel-first: user downloads **DBD XBRL in Excel V.2.0** from DBD e-Filing, fills the workbook, validates/converts, then submits through the e-Filing portal.
- The downloaded package contains:
  - Excel input workbook,
  - Java builder `.jar`,
  - bundled JRE folder.
- The DBD Builder validates the workbook and converts it to XBRL ZIP output.
- Public docs still reference Java Runtime Environment 8+ for the DBD XBRL-in-Excel tooling path.
- The workbook is worksheet-specific and supports current/prior period columns.
- Some rows support sub-items, but public docs show a max of 8 sub-items per main line in the illustrated workflow. CPA must confirm this against the current authenticated template.
- Some cells are Thai-only. The public manual shows validation warnings when Thai-only sub-item labels contain English text.

## Statement Forms Seen In Public Validation Appendix

These codes are useful for engineering shape only. The public appendix excerpt seen during desk-check is a company/general-business taxonomy example, not a validated Lumera/NPAE template. These codes do not replace the authenticated workbook schema.

| Code | Thai form | Engineering note |
|---|---|---|
| `210000` | งบแสดงฐานะการเงิน | Balance sheet |
| `220000` | งบกำไรขาดทุนเบ็ดเสร็จ แบบจำแนกค่าใช้จ่ายตามลักษณะของค่าใช้จ่าย แสดงแบบงบเดียว | OCI/income statement by nature, one statement |
| `230000` | งบกำไรขาดทุนและงบกำไรขาดทุนเบ็ดเสร็จ แบบจำแนกค่าใช้จ่ายตามลักษณะของค่าใช้จ่าย แสดงแบบสองงบ | Income + OCI by nature, two statements |
| `240000` | งบกำไรขาดทุนเบ็ดเสร็จ แบบจำแนกค่าใช้จ่ายตามหน้าที่-แบบขั้นเดียว แสดงแบบงบเดียว | By function, single-step, one statement |
| `250000` | งบกำไรขาดทุนและงบกำไรขาดทุนเบ็ดเสร็จ แบบจำแนกค่าใช้จ่ายตามหน้าที่-แบบขั้นเดียว แสดงแบบสองงบ | By function, single-step, two statements |
| `260000` | งบกำไรขาดทุนเบ็ดเสร็จ แบบจำแนกค่าใช้จ่ายตามหน้าที่-แบบหลายขั้น แสดงแบบงบเดียว | By function, multi-step, one statement |
| `270000` | งบกำไรขาดทุนและงบกำไรขาดทุนเบ็ดเสร็จ แบบจำแนกค่าใช้จ่ายตามหน้าที่-แบบหลายขั้น แสดงแบบสองงบ | By function, multi-step, two statements |
| `281000` | งบกำไรขาดทุนและกำไรขาดทุนสะสม แบบจำแนกค่าใช้จ่ายตามลักษณะของค่าใช้จ่าย | Income + retained earnings by nature |
| `282000` | งบกำไรขาดทุนและกำไรขาดทุนสะสม แบบจำแนกค่าใช้จ่ายตามหน้าที่-แบบขั้นเดียว | Income + retained earnings by function, single-step |
| `283000` | งบกำไรขาดทุนและกำไรขาดทุนสะสม แบบจำแนกค่าใช้จ่ายตามหน้าที่-แบบหลายขั้น | Income + retained earnings by function, multi-step |
| `310000` | งบกระแสเงินสด ตามวิธีทางตรง | Cash flow, direct |
| `320000` | งบกระแสเงินสด ตามวิธีทางอ้อม | Cash flow, indirect |
| `410000` | งบแสดงการเปลี่ยนแปลงส่วนของผู้ถือหุ้น | Statement of changes in equity |
| `420000` | งบแสดงการเปลี่ยนแปลงส่วนของผู้ถือหุ้น (งบการเงินรวม) | Consolidated equity changes; out of MVP scope |

## Public Validation Rules Seen

These are starter rules only:

- Total assets must equal total liabilities plus equity.
- Registered share capital must be greater than zero.
- Issued and paid-up capital must be shown in the balance sheet.
- Paid-up capital must not exceed registered preferred share capital where applicable.
- Paid-up capital must not exceed registered ordinary share capital where applicable.
- Income statement/OCI presentation variants include tie rules between profit/loss and allocation rows.

## Engineering Contract For Phase 12b

Phase 12b must not hard-code DBD row positions from this public desk-check. It must read a CPA-validated `dbd-template-schema.json` produced from the authenticated workbook.

Minimum validated schema fields:

- `template_version`
- `template_file_hash`
- `taxonomy_code`
- `worksheet_name`
- `statement_code`
- `row_id` / DBD taxonomy line identifier
- Thai label
- English label, if present
- current-period cell
- prior-period cell
- sign convention
- required/optional flag
- sub-item rules
- validation rules
- source GL/account mapping hint

## CPA/Builder Gate

This spec becomes implementation-ready only after:

1. CPA confirms correct taxonomy/template for Lumera-like Thai companies.
2. Authenticated current DBD workbook is downloaded and hashed.
3. Row/cell mapping is extracted from that workbook.
4. A generated sample workbook passes DBD Builder validation.
5. Builder errors are captured as regression fixtures.
