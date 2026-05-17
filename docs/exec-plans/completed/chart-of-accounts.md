# Chart of Accounts (v1) — Thai Retail + Online SME

**Status:** Draft for user review — captured 2026-04-27 (round-6 user direction)
**Position:** Reference seed for Phase 10.5 GL primitives. Every plan that posts JEs uses these codes.
**Compliance posture:** This is a Thai SME seed COA, not a substitute for TFRS/DBD taxonomy. It uses the common Thai 4-digit convention (1xxx Asset / 2xxx Liability / 3xxx Equity / 4xxx Revenue / 5xxx COGS / 6xxx Expense / 7xxx Non-operating), but audit/filing compliance comes from (a) correct GL postings, (b) Thai-language records and account-code explanations, (c) immutable source evidence, (d) Phase 12b's GL-account-to-DBD-taxonomy mapping, and (e) Thai CPA review/sign-off. Primary MVP target is Thai Co., Ltd.; other entity types may use the platform but company-only accounts are hidden by entity gates.

**Bilingual rule:** Every account has both `name_en` and `name_th`. The platform UI surfaces both. RD/DBD filings use `name_th`; export/foreign-counterparty docs use `name_en`. UI language toggle controls preview. When a tenant exports statutory books, account-code explanations must be available in Thai (required when records use code abbreviations).

**Adaptation rule:** Tenants may add custom sub-accounts under any parent (e.g. `4111 Retail sales — store A` under `4110`), but the seeded set is stable across orgs to keep audit-pack templates and tax-engine mappings deterministic.

## Tenant extensibility

The base set above is canonical for every tenant. Beyond it, tenants can adapt the COA to their actual business — most operators (online sellers, importers, service shops) think in their own categories long before they think in TFRS codes, and a rigid COA loses the bookkeeping value that comes from naming things the way the business actually runs. The platform closes the operator-↔-accountant gap by letting tenants extend, not rewrite, the COA.

**What tenants may do:**
- **Add new accounts** in any system category (1xxx Asset / 2xxx Liability / 3xxx Equity / 4xxx Revenue / 5xxx COGS / 6xxx Expense / 7xxx Non-operating). Tenant additions land in a tenant-reserved code range within the parent (e.g. `4191`, `4192`, … under `41xx Sales`) and are flagged `is_system=false`. Category prefix is enforced at write-time — a tenant cannot file an Asset under `2xxx`.
- **Override descriptions** on system accounts via a per-tenant `description_override` (TH + EN). Original system description is preserved and shown alongside.
- **Add per-tenant guidance** ("`6210 Rent — premises` includes our two warehouse leases but not the showroom; that's `6211`") so the tenant's accountants and AI suggestions both pick the right code.

**What tenants cannot do:**
- Delete or relabel system accounts.
- Move an account between categories (no `4110 → 6110` reclassification).
- Create new categories.
- Hard-delete any account that has been posted to (matches Phase 10.5 audit rule).

**AI-assisted COA tuning (planned):**
- Tenant describes their business in natural language ("we import figurines from Japan, sell on Shopee + our own webstore, occasional consulting on display setup"). Model proposes additions and description overrides — e.g. add `5165 Inbound freight — Japan import lane` under `5160`, override `4140 Service revenue` description to "consulting only; product fees go to `4120`".
- Suggestions are advisory: tenant approves each addition / edit. Approvals logged to `audit_log`.
- Model also flags miscoded historical postings ("the 14 entries on `6990 Misc` over the last 90 days look like marketing — reclassify to `6311`?") with a one-click reclassification JE.

**Automated accounts (tax-engine-owned):**
- A subset of system accounts is owned by the tax engine: every output/input VAT bucket (1131, 1132, 1251–1253, 2143, 2150–2152), every WHT-payable line (2153–2156), SSO/PF/CIT (2157, 2159, 2170), and the bank/customer-deposit auto-clearing pieces. The engine debits / credits these on each sale, payroll run, supplier-WHT certificate, PP 30 close, etc.
- Operators must NOT pick automated accounts in user-mode manual JE — the picker hides them. Accountant mode shows them with a warning ("the tax engine writes to this account; manual entry will create reconciliation drift").
- Schema flag: `is_automated bool` on `gl_accounts`. Per-account, system-set, not tenant-overridable.

**Conditionally hidden accounts:**
- Accounts that only apply when a specific business condition holds are hidden via tenant-flag rather than removed from seed. Examples:
  - VAT family (1131, 1132, 1251–1253, 2143, 2150–2152, 4170) — hidden for non-VAT-registered tenants (revenue ≤ 1.8M THB/yr).
  - `1160 Inventory` and Phase 10.6 inventory subledger — hidden for services-only tenants.
  - `3110 Registered share capital`, `3130 Share premium`, `3210 Legal reserve`, and `3240 Dividends declared` — Co., Ltd. only. Hidden for sole proprietorships and partnerships. `3210` is auto-managed by year-end close for Co., Ltd. tenants.
  - Lease/provision accounts — hidden until tenant elects a lease/provision policy that needs them for TFRS notes.
- Schema flag: `visibility_condition text` on `gl_accounts` (e.g. `vat_registered`, `co_ltd`, `has_inventory`, `has_lease`, `has_provisions`); UI evaluates against tenant settings.

**Schema implications (Phase 10.5):**
- `gl_accounts` table gets:
  - `is_system bool` — true for seed accounts, false for tenant additions.
  - `is_automated bool` — true for tax-engine-owned accounts.
  - `is_postable bool DEFAULT true` — false for memo/reporting-only accounts such as registered-but-unpaid capital.
  - `description_override_en text`, `description_override_th text` — per-tenant plain-language descriptions; original system description preserved.
  - `parent_code text` — for nested tenant adds.
  - `visibility_condition text` — gating flag for conditionally-hidden accounts.
  - `dbd_taxonomy_hint text` — optional line-item hint consumed by Phase 12b mapping; not authoritative and versioned by `dbd_template_schema.json`.
  - `tenant_added_by uuid`, `tenant_added_at timestamptz` — provenance for tenant additions.
- Category-prefix invariant enforced at insert/update time.
- AI-suggested additions go through the existing AI suggestion review flow (per CLAUDE.md rule 6: AI suggests, humans confirm).

## Categories at a glance

| Range | Category | EN | TH |
|------:|----------|-----|----|
| 11xx | Cash & receivables | Current assets — cash and receivables | สินทรัพย์หมุนเวียน — เงินสดและลูกหนี้ |
| 12xx | Inventory + tax assets | Inventory + recoverable taxes | สินค้าคงเหลือและภาษีรอรับคืน |
| 13xx | Fixed assets | Property, plant & equipment | ที่ดิน อาคาร และอุปกรณ์ |
| 14xx | Other long-term assets | Deposits, intangibles | เงินมัดจำ สินทรัพย์ไม่มีตัวตน |
| 21xx | Current liabilities | Payables + tax + payroll obligations | หนี้สินหมุนเวียน |
| 22xx | Long-term liabilities | Loans, related-party | หนี้สินไม่หมุนเวียน |
| 31xx | Capital | Share capital + premium | ทุน |
| 32xx | Retained earnings + reserves | Reserves, retained earnings, current P&L | กำไรสะสมและสำรอง |
| 41xx | Revenue — sales | Trading revenue (retail / online / wholesale / service) | รายได้จากการขาย |
| 42xx | Revenue — rebates | Marketplace / processor rebates | รายได้ส่วนลด |
| 43xx | Other income | Interest, FX gain, asset disposal gain | รายได้อื่น |
| 51xx | COGS | Cost of goods sold + period-expensed inbound costs | ต้นทุนขาย |
| 61xx | Personnel | Salaries, SSO, PF, welfare | ค่าใช้จ่ายบุคลากร |
| 62xx | Premises | Rent, utilities, internet | ค่าใช้จ่ายสถานที่ |
| 63xx | Marketing | Ads (offline + online), influencer, promotion | ค่าใช้จ่ายการตลาด |
| 64xx | Sales channel | Marketplace fees, gateway fees, outbound shipping, packaging | ค่าใช้จ่ายช่องทางขาย |
| 65xx | Operations | Repairs, cleaning, office supplies | ค่าใช้จ่ายดำเนินงาน |
| 66xx | Travel + vehicle | Travel, entertainment, vehicle | ค่าเดินทางและยานพาหนะ |
| 67xx | Professional + IT | Professional fees, software | ค่าธรรมเนียมวิชาชีพและเทคโนโลยี |
| 68xx | Tax + depreciation + admin | CIT expense, stamp duty, depreciation, amortization, FX loss, bad debt, bank charges, penalties | ภาษี ค่าเสื่อมราคา และค่าใช้จ่ายบริหาร |
| 69xx | Other expense | Donations, miscellaneous | ค่าใช้จ่ายอื่น |
| 71xx | Non-operating | Interest expense | ดอกเบี้ยจ่าย |

## Detailed accounts

### 1xxx — Assets / สินทรัพย์

| Code | EN | TH | Notes |
|------|----|----|-------|
| 1110 | Cash on hand | เงินสดในมือ | Per-establishment register cash |
| 1111 | Bank — operating | เงินฝากธนาคาร — บัญชีดำเนินงาน | Primary current account |
| 1112 | Bank — savings | เงินฝากออมทรัพย์ | |
| 1113 | Bank — POS settlement | เงินฝากธนาคาร — รับชำระ POS | Card/QR settlement landing account |
| 1114 | Bank — foreign currency | เงินฝากธนาคาร — สกุลต่างประเทศ | One row per FX bank account; revaluation runs through 4330 / 6870 |
| 1120 | Cash in transit | เงินระหว่างทาง | POS cash physically deposited but not yet at bank. Processor/marketplace settlement receivables use 1142 so trade AR aging stays clean. |
| 1131 | VAT refund receivable | ภาษีซื้อที่ขอคืนได้ค้างรับ | Set when refund elected per Phase 6 |
| 1132 | Input VAT — pending tax invoice | ภาษีซื้อรอใบกำกับภาษี | P0-5 leak-guard buffer when supplier hasn't issued tax invoice yet; sweeps to 1251 on receipt |
| 1140 | Trade accounts receivable | ลูกหนี้การค้า | Customer invoices unpaid — we sold/serviced something on credit, customer hasn't paid yet |
| 1141 | Allowance for doubtful accounts | ค่าเผื่อหนี้สงสัยจะสูญ | Contra to 1140 |
| 1142 | Processor / marketplace settlement receivable | ลูกหนี้รอรับจากผู้ให้บริการรับชำระเงิน/Marketplace | Card, QR, marketplace T+1/T+2 settlement. Excluded from trade AR aging; reconciles by processor/channel dimension. |
| 1150 | Other receivables | ลูกหนี้อื่น | Non-trade |
| 1160 | Inventory — merchandise | สินค้าคงเหลือ — สินค้าสำเร็จรูป | Phase 10.6 SKU-level subledger ties here |
| 1170 | Prepaid expenses | ค่าใช้จ่ายจ่ายล่วงหน้า | Rent, insurance, software prepaid |
| 1180 | Prepaid WHT | ภาษีหัก ณ ที่จ่ายจ่ายล่วงหน้า | WHT customers withhold on us → CIT credit |
| 1251 | Input VAT recoverable | ภาษีซื้อ | PP 30 input column |
| 1252 | VAT carry-forward asset | ภาษีซื้อยกไป | When current input > output |
| 1253 | Input VAT — PP 36 pending | ภาษีซื้อ — ภ.พ. 36 รอเรียกคืน | Self-assessed VAT pre-payment per round-5 PP 36 lifecycle |
| 1310 | Land | ที่ดิน | Not depreciated |
| 1320 | Buildings | อาคาร | |
| 1321 | Accum. depreciation — buildings | ค่าเสื่อมราคาสะสม — อาคาร | Contra to 1320 |
| 1330 | Equipment | อุปกรณ์ | |
| 1331 | Accum. depreciation — equipment | ค่าเสื่อมราคาสะสม — อุปกรณ์ | |
| 1340 | Vehicles | ยานพาหนะ | |
| 1341 | Accum. depreciation — vehicles | ค่าเสื่อมราคาสะสม — ยานพาหนะ | |
| 1350 | Computer equipment | คอมพิวเตอร์และอุปกรณ์ | |
| 1351 | Accum. depreciation — computer | ค่าเสื่อมราคาสะสม — คอมพิวเตอร์ | |
| 1360 | Furniture & fixtures | เครื่องตกแต่งและติดตั้ง | |
| 1361 | Accum. depreciation — F&F | ค่าเสื่อมราคาสะสม — เครื่องตกแต่ง | |
| 1410 | Deposits & guarantees | เงินมัดจำและหลักประกัน | Rent deposit, utility deposit |
| 1420 | Intangibles — software | สินทรัพย์ไม่มีตัวตน — ซอฟต์แวร์ | |
| 1421 | Accum. amortization — software | ค่าตัดจำหน่ายสะสม — ซอฟต์แวร์ | |

### 2xxx — Liabilities / หนี้สิน

| Code | EN | TH | Notes |
|------|----|----|-------|
| 2110 | Trade accounts payable | เจ้าหนี้การค้า | |
| 2120 | Other payables | เจ้าหนี้อื่น | |
| 2130 | Accrued expenses | ค่าใช้จ่ายค้างจ่าย | Utilities, rent, services not yet billed |
| 2143 | Output VAT — pending PP 30 close | ภาษีขาย — รอปิดงวด ภ.พ. 30 | Holding bucket between per-sale liability accrual and period close; sweeps to 2151 on close |
| 2150 | Output VAT — sales | ภาษีขาย | Per-sale liability before period close |
| 2151 | Output VAT payable (PP 30 net) | ภาษีมูลค่าเพิ่มค้างจ่าย (ภ.พ. 30) | Net of input on close |
| 2152 | PP 36 self-assessed VAT payable | ภาษีมูลค่าเพิ่มค้างจ่าย (ภ.พ. 36) | Phase 9 foreign-services |
| 2153 | WHT payable — PND.3 | ภาษีหัก ณ ที่จ่ายค้างจ่าย — ภ.ง.ด. 3 | Individual recipients |
| 2154 | WHT payable — PND.53 | ภาษีหัก ณ ที่จ่ายค้างจ่าย — ภ.ง.ด. 53 | Juristic recipients |
| 2155 | WHT payable — PND.54 | ภาษีหัก ณ ที่จ่ายค้างจ่าย — ภ.ง.ด. 54 | Foreign payee per §70 |
| 2156 | WHT payable — PND.1 (payroll) | ภาษีหัก ณ ที่จ่ายค้างจ่าย — ภ.ง.ด. 1 | Phase 11 |
| 2157 | SSO payable (employee + employer) | เงินประกันสังคมค้างจ่าย | Phase 11 |
| 2158 | Salaries & wages payable | เงินเดือนและค่าจ้างค้างจ่าย | |
| 2159 | Provident fund payable | กองทุนสำรองเลี้ยงชีพค้างจ่าย | Phase 11 |
| 2160 | Customer deposits & gift vouchers | เงินรับล่วงหน้าและบัตรกำนัล | Critical for online — pre-orders + voucher liability |
| 2170 | CIT payable | ภาษีเงินได้นิติบุคคลค้างจ่าย | Phase 12a |
| 2185 | Short-term loans — bank | เงินกู้ยืมระยะสั้น — ธนาคาร | <12mo bank borrowings; long-term portion in 2210 |
| 2190 | Other current liabilities | หนี้สินหมุนเวียนอื่น | |
| 2195 | Provisions — current | ประมาณการหนี้สินหมุนเวียน | Hidden until needed for warranty/legal/other provisions |
| 2210 | Long-term loan — bank | เงินกู้ยืมระยะยาว — ธนาคาร | |
| 2220 | Loans — directors / related parties | เงินกู้ยืมจากกรรมการ/บริษัทเกี่ยวข้องกัน | DBD related-party disclosure |
| 2230 | Lease liabilities — long-term | หนี้สินตามสัญญาเช่าระยะยาว | Hidden until lease-accounting policy requires it |

### 3xxx — Equity / ส่วนของผู้ถือหุ้น

| Code | EN | TH | Notes |
|------|----|----|-------|
| 3110 | Registered share capital | ทุนจดทะเบียน | Memo/reporting-only (`is_postable=false`) unless CPA explicitly enables. Do not double-count with paid-up capital. |
| 3120 | Paid-up share capital | ทุนชำระแล้ว | Balance-sheet equity posting account |
| 3130 | Share premium | ส่วนเกินมูลค่าหุ้น | |
| 3210 | Legal reserve | สำรองตามกฎหมาย | 5%/year per Civil & Commercial Code §1202 until 10% of capital |
| 3220 | Retained earnings | กำไรสะสม | |
| 3230 | Current year P&L (income summary) | กำไร(ขาดทุน) งวดปัจจุบัน | Year-end roll-forward target |
| 3240 | Dividends declared | เงินปันผลประกาศจ่าย | |

### 4xxx — Revenue / รายได้

| Code | EN | TH | Notes |
|------|----|----|-------|
| 4110 | Retail sales — store | รายได้จากการขายปลีก — หน้าร้าน | POS-channel sales |
| 4120 | Online sales | รายได้จากการขายออนไลน์ | Marketplace + own webstore |
| 4130 | Wholesale sales | รายได้จากการขายส่ง | B2B |
| 4140 | Service revenue | รายได้จากการให้บริการ | Subscription, service, repair |
| 4150 | Sales returns & allowances | รับคืนสินค้าและส่วนลดจ่าย | Contra-revenue. Item-level discounts on sales records record net to 4110/4120/4130 directly — no separate GL line |
| 4170 | Deemed-supply income | รายได้จากการขายโดยถือเสมือนขาย | Free samples, promo give-aways, and other §77/2 deemed supplies that trigger output VAT (mandatory for VAT-registered tenants per Thai Revenue Code §77/2; hidden for non-VAT tenants) |
| 4210 | Marketplace rebates | ส่วนลด/รีเบทจาก Marketplace | Periodic platform rebates (separate from 4150) |
| 4220 | Supplier rebates / discounts received | ส่วนลดรับจากผู้ขาย | Use only for rebates not tied to specific inventory cost. Purchase-price discounts tied to inventory reduce 1160/5110 via posting policy. |
| 4310 | Other income | รายได้อื่น | |
| 4320 | Interest income | ดอกเบี้ยรับ | |
| 4330 | FX gain | กำไรจากอัตราแลกเปลี่ยน | Phase 14 revaluation lands here |
| 4340 | Gain on disposal of assets | กำไรจากการจำหน่ายสินทรัพย์ | Phase 13 |

### 5xxx — Cost of goods sold / ต้นทุนขาย

| Code | EN | TH | Notes |
|------|----|----|-------|
| 5110 | Cost of goods sold | ต้นทุนขาย | Per-sale debit when SKU dispatched (Phase 10.6) |
| 5120 | Inventory adjustments | ผลต่างสินค้าคงเหลือ | Cycle-count discrepancies + shrinkage / theft / unexplained loss |
| 5130 | Inventory write-offs | ขาดทุนจากสินค้าเสื่อมสภาพและตัดจำหน่าย | NRV write-down, obsolescence, damage, expired-stock write-off |
| 5150 | Customs duty (period-expensed) | ภาษีศุลกากร (รับรู้เป็นค่าใช้จ่าย) | Round-6 user direction: import duty hits expense, not capitalized |
| 5151 | Import excise and government charges | ภาษีสรรพสามิตและค่าธรรมเนียมนำเข้า | Import excise / government import charges when applicable |
| 5160 | Inbound freight & brokerage (period-expensed) | ค่าขนส่งและพิธีการศุลกากรขาเข้า | Same — per-period expense; Phase 10.6 year-end true-up reclassifies unsold portion if material per TFRS NPAEs §8 |

### 6xxx — Operating expenses / ค่าใช้จ่ายดำเนินงาน

#### 61xx Personnel

| Code | EN | TH |
|------|----|----|
| 6110 | Salaries & wages | เงินเดือนและค่าจ้าง |
| 6111 | Bonus | โบนัส |
| 6112 | Social security expense (employer) | ค่าใช้จ่ายประกันสังคม — นายจ้าง |
| 6113 | Provident fund expense (employer) | ค่าใช้จ่ายกองทุนสำรองเลี้ยงชีพ — นายจ้าง |
| 6114 | Employee welfare | สวัสดิการพนักงาน |
| 6115 | Training | ค่าฝึกอบรม |
| 6116 | Contractor & freelancer fees | ค่าจ้างผู้รับเหมา/ฟรีแลนซ์ |

#### 62xx Premises

| Code | EN | TH |
|------|----|----|
| 6210 | Rent — premises | ค่าเช่าสถานที่ |
| 6211 | Utilities | ค่าสาธารณูปโภค |
| 6212 | Internet & telephone | ค่าอินเทอร์เน็ตและโทรศัพท์ |

#### 63xx Marketing

| Code | EN | TH |
|------|----|----|
| 6310 | Marketing & advertising (offline) | ค่าโฆษณาและการตลาด |
| 6311 | Online ads — Meta / Google / TikTok / etc. | ค่าโฆษณาออนไลน์ |
| 6312 | Influencer & promotion | ค่าใช้จ่ายส่งเสริมการขาย |

#### 64xx Sales channel

| Code | EN | TH |
|------|----|----|
| 6410 | Marketplace commission | ค่าคอมมิชชั่น Marketplace |
| 6411 | Payment gateway / card-processing fees | ค่าธรรมเนียมรับชำระ |
| 6412 | Outbound shipping & courier | ค่าขนส่งสินค้าออก |
| 6413 | Packaging | ค่าบรรจุภัณฑ์ |

#### 65xx Operations

| Code | EN | TH |
|------|----|----|
| 6510 | Repairs & maintenance | ค่าซ่อมแซม |
| 6511 | Cleaning | ค่าทำความสะอาด |
| 6512 | Office supplies | ค่าใช้จ่ายสำนักงาน |

#### 66xx Travel & vehicle

| Code | EN | TH |
|------|----|----|
| 6610 | Travel & entertainment | ค่าเดินทางและรับรอง |
| 6611 | Vehicle expenses | ค่าใช้จ่ายยานพาหนะ |

#### 67xx Professional + IT

| Code | EN | TH |
|------|----|----|
| 6710 | Software subscriptions (SaaS) | ค่าบริการซอฟต์แวร์ |
| 6711 | Professional fees — legal | ค่าธรรมเนียมวิชาชีพ — กฎหมาย |
| 6712 | Professional fees — accounting | ค่าธรรมเนียมวิชาชีพ — บัญชี |
| 6713 | Audit fees | ค่าสอบบัญชี |

#### 68xx Tax + depreciation + admin

| Code | EN | TH |
|------|----|----|
| 6810 | Corporate income tax expense | ค่าใช้จ่ายภาษีเงินได้นิติบุคคล |
| 6811 | Stamp duty | ค่าอากรแสตมป์ |
| 6820 | Depreciation — buildings | ค่าเสื่อมราคา — อาคาร |
| 6821 | Depreciation — equipment | ค่าเสื่อมราคา — อุปกรณ์ |
| 6822 | Depreciation — vehicles | ค่าเสื่อมราคา — ยานพาหนะ |
| 6823 | Depreciation — computer | ค่าเสื่อมราคา — คอมพิวเตอร์ |
| 6824 | Depreciation — F&F | ค่าเสื่อมราคา — เครื่องตกแต่ง |
| 6830 | Amortization — software | ค่าตัดจำหน่าย — ซอฟต์แวร์ |
| 6850 | Bad debt expense | หนี้สูญและหนี้สงสัยจะสูญ |
| 6860 | Bank charges | ค่าธรรมเนียมธนาคาร |
| 6870 | FX loss | ขาดทุนจากอัตราแลกเปลี่ยน |
| 6880 | Loss on disposal of assets | ขาดทุนจากการจำหน่ายสินทรัพย์ |
| 6905 | Tax penalties & surcharges | ค่าปรับและเงินเพิ่มทางภาษี |

#### 69xx Other

| Code | EN | TH |
|------|----|----|
| 6910 | Donations | เงินบริจาค |
| 6990 | Miscellaneous expenses | ค่าใช้จ่ายเบ็ดเตล็ด |

### 7xxx — Non-operating / นอกการดำเนินงาน

| Code | EN | TH |
|------|----|----|
| 7110 | Interest expense | ดอกเบี้ยจ่าย |

## Tax-engine wiring (every code referenced from a phase plan)

| Phase | Posting rule | GL accounts |
|-------|--------------|-------------|
| Phase 3 (expense doc confirmed) | Dr 6xxx + Dr 1251 input VAT (if any) → Cr 2110 AP / Cr 1111 bank | 6xxx mapped from category, 1251, 2110 or 1111, 2153/2154/2155 if WHT |
| Phase 6 (PP 30 settlement) | Universal close-out template | 2151, 1252, 1251, 1111, 1131, 1253 |
| Phase 9 (PP 36 lifecycle) | 4-step: recognize → declare → remit → reclaim | 1253, 2152, 1111, 1251 |
| Phase 10 (POS sale) | Dr 1110/1142 → Cr 4110/4120 + Cr 2150 | 1110, 1142, 4110, 4120, 2150 |
| Phase 10.5 (manual JE) | Per template | any |
| Phase 10.6 (import — direct clear or via broker) | Dr 1160 + Dr 1251 import VAT + Dr 5150 duty + Dr 5151 excise/govt charges + Dr 5160 freight/brokerage → Cr 1111 + Cr 2110/2190 | 1160, 1251, 5150, 5151, 5160, 1111, 2110, 2190 |
| Phase 11 (payroll pay slip) | Dr 6110/6111/6112/6113 → Cr 2156 PND.1 + Cr 2157 SSO + Cr 2158 salaries + Cr 2159 PF | 6110-6115, 2156-2159 |
| Phase 12a (CIT accrual + filing) | Dr 6810 → Cr 2170; later Dr 2170 → Cr 1111 | 6810, 2170, 1111 |
| Phase 13 (depreciation cron) | Dr 6820-6824 → Cr 1321/1331/1341/1351/1361 | 6820-6824, 1321-1361 |
| Phase 14 (FX revaluation) | Dr/Cr monetary account offset with Cr 4330 FX gain or Dr 6870 FX loss | 4330, 6870 |

## Open questions (user review)

_(none — pending user review pass on master COA + tenant extensibility section)_

## Resolved

- [x] **Phase-wide code migration to master COA (path A2 complete).** Phase 10.5 inline seed block deleted and replaced with pointer to this file. Stale codes migrated to master across `phase-9-foreign-vendor-tax.md`, `phase-10-5-gl-primitives.md`, `phase-10-6-imports.md`, `phase-10-6-inventory-cogs-imports.md`, `phase-11-payroll.md`, `phase-12a-cit-engine.md`, `phase-13-fixed-assets-depreciation.md`, `phase-14-analytics-audit-pack.md`. Per-channel clearing now uses `1142` + `journal_lines.dimension`; trade AR remains `1140`; bank-FX uses `1114` + currency dimension. Manufacturing accounts (raw materials, production labour) stay out of v1 seed — tenants extend via Tenant Extensibility mechanism (proposed codes `1162`, `5170`, `5180`).
- [x] **Round-6 simplification pass.** Removed `2140 Bank/gateway clearing`, `4160 Sales discounts`, `5140 Inventory shrinkage`, and the `2180 Sales return reserve` from earlier pass. Renamed `5130 Inventory write-downs` → `5130 Inventory write-offs` (broadened scope). Added `is_automated` flag for tax-engine-owned accounts; added `visibility_condition` for conditionally-hidden accounts (VAT family, inventory, share premium, legal reserve).
- [x] **`1141` code collision (resolved via path A2).** Phase 10.5's "Cash in transit (clearing)" collapses into master `1120 Cash in transit`, whose description is now broadened to cover both POS cash physical-deposit transit and gateway settlement timing. `1141` stays as "Allowance for doubtful accounts" (contra to `1140 AR`) per Thai/IFRS convention. Phase 10.5 lines 77 + 309 + 311 updated. Detailed transit-type tracking moves to a `journal_lines.dimension` value (e.g. `cash_deposit` vs `gateway_settlement`).
- [x] **Granularity of sales accounts.** Single line `4110 Retail sales`; no per-store split. Per-store / per-channel analytics handled by Phase 14 cost-center / project dimension on `journal_lines`, not by code multiplication.
- [x] **Marketplace breakdowns.** Single line `4120 Online sales` + `journal_lines.channel_key` dimension (Shopee / Lazada / TikTok / own webstore). No per-channel revenue codes.
- [x] **VAT registration toggle.** Non-VAT-registered tenants (revenue ≤ 1.8M THB/yr) hide 1131 / 1251–1253 / 2150–2152 via tenant flag; seed retains them so registration upgrade is non-migrating.
- [x] **Inventory subledger detail.** `1160` hidden for services-only tenants (post directly to 5xxx). Tenants with goods inventory get full SKU-level subledger via Phase 10.6 — covers FX-cost imports (Japan → resale shop), duty + freight capitalisation into landed cost, sale-time inventory→COGS movement.
- [x] **Import landed-cost component retention.** Even when owner-facing daily UX expenses freight/duty/brokerage/non-recoverable tax for simplicity, the import/inventory subledger stores per-import/per-lot statutory overhead components from day 1. Year-end TFRS carrying-value true-up consumes those components; the COA cannot be the only place this accounting policy lives.
- [x] **Allowance for doubtful accounts (1141).** Ship account `1141`; v1 = manual JE only. Future enhancement: auto-provision keyed off AR aging buckets, exposed via the overdues report.
- [x] **`4150 Sales returns` only — `2180` removed.** Returns booked when goods physically returned (debit `4150`, reverse VAT). No reserve account. Forward-looking return provisioning deferred to a future POS / marketplace integration that can model channel-specific return windows; not worth a manual reserve JE in v1.

## Verification checklist

- [ ] Every account has both `name_en` and `name_th` populated.
- [ ] Every code referenced from any phase plan exists in this list.
- [ ] No two accounts share a code.
- [ ] Categories sum to a clean BS + P&L when all leaves are posted.
- [ ] Hide rules surface non-VAT and services-only modes correctly.
- [ ] Seeded set installs idempotently for new tenants and is upgrade-safe for existing tenants.
