# Thai VAT & WHT Compliance Reference

**Purpose.** Authoritative reference for the agent reviewing tax-compliance logic in a retail accounting SaaS that ingests POS sales data and bank statements, produces VAT (PP.30, PP.36) and WHT (PND.1/3/53/54) submissions, and will later ingest payroll data for staff salary/WHT automation. Treat this document as the source of truth; if internal logic disagrees with it, flag the disagreement rather than reconciling silently.

**Jurisdiction.** Thailand only. For Thai-incorporated companies (juristic persons) operating retail in-country.

**Effective date.** Aligned with rules in force as of April 2026, including the revised PP.30 form effective 1 March 2026 and the e-filing extension period running 1 February 2024 → 31 January 2027.

---

## 1. Architecture: the two-ledger model

The system MUST treat sales recognition and cash settlement as two distinct ledgers that reconcile against each other. They MUST NOT be derived from a single source.

| Ledger | Source of truth | Drives |
|---|---|---|
| **Sales ledger** | POS export/API (gross sales) | Revenue, output VAT, PP.30 |
| **Settlement ledger** | Bank statements + processor settlement reports | Cash position, processor-fee expense, processor-fee input VAT |
| **Cash ledger** | Daily cash count + bank deposit slips | Drawer reconciliation, shortages/overages |

The reconciliation primitive is the **clearing account per payment channel** (one per card aggregator, one per QR/wallet provider, one for cash, one for invoiced B2B AR, etc.). A sale increases the relevant clearing account; a settlement deposit clears it. A clearing account that does not return to zero within its expected settlement window is the agent's primary exception signal.

**Hard rule.** The VAT base for output VAT is the gross sale price recorded by the POS, **not** the net amount that lands in the bank after processor fees, MDR, marketplace commissions, or platform charges. Using settlement-net amounts as the VAT base is a compliance defect that under-reports output VAT.

---

## 2. VAT framework

### 2.1 Rates and registration

- **Standard rate:** 7% (statutory 10%, reduced by Royal Decree). Current reduced rate extended through 30 September 2026. Logic must read the rate from a configurable table, not a constant — the rate changes by Royal Decree.
- **Zero rate (0%):** exports of goods, international transport, certain services rendered in Thailand but used wholly abroad, sales into duty-free zones. Zero-rated suppliers issue tax invoices and may reclaim input VAT.
- **Exempt:** healthcare, education, domestic land transport, residential rent, unprocessed agricultural products, certain professional services. Exempt suppliers do **not** issue tax invoices and cannot reclaim input VAT.
- **Mandatory registration:** annual taxable turnover > THB 1,800,000. Must register within 30 days of crossing the threshold (Revenue Code §85/1).
- **Voluntary registration:** allowed below threshold; useful for input-VAT recovery and B2B credibility.
- **Specific Business Tax (SBT):** parallel regime for activities outside VAT scope (banking, insurance, real-estate sales, factoring, etc.). Filed monthly on Form PT.40 by the 15th. Out of scope for typical retail; flag any client whose activities trigger SBT.

### 2.2 Tax point (timing of liability)

| Transaction | Tax point |
|---|---|
| Sale of goods (general) | Earliest of: delivery, transfer of ownership, payment received, tax invoice issued |
| Cash/card retail sale | At the moment of sale (when ABB is issued by the cash register) |
| Sale on credit (B2B AR) | Delivery / invoice — payment timing irrelevant |
| Sale of services | Earliest of: payment received, tax invoice issued, service consumed |
| Imported goods | At customs clearance |
| Imported services (reverse charge) | When payment is made to the foreign supplier |

The tax point determines which **tax month** a sale belongs in, regardless of when settlement to bank occurs. Sales on the last day of a month that settle in the following month belong in the prior month's PP.30. The agent must check that recognition uses POS sale date, not bank deposit date.

### 2.3 Output VAT (sales)

**Tax base = gross consideration charged to the customer**, exclusive of VAT itself, post any line-item discounts shown on the tax invoice.

Formula:
```
Output VAT (per sale) = Tax base × current VAT rate
Tax base             = Gross price − VAT component (if VAT-inclusive pricing) − line-item discount
```

Items that **do not** reduce the tax base:
- Payment-processor / card-aggregator commissions (MDR)
- Marketplace platform fees
- Bank merchant-discount fees
- QR/wallet provider fees
- Delivery-platform commissions (Grab, Lineman, Foodpanda, etc.)

These are all opex. They appear on the cost side of the P&L and may carry recoverable input VAT against the processor's own tax invoice — never against your output VAT base.

**Discounts:**
- Discount given at the time of sale and shown on the tax invoice → reduces tax base (legitimate).
- Discount given after the fact → must be processed via a credit note (ใบลดหนี้) which reduces output VAT in the month the credit note is issued, not retroactively.

**Refunds, voids, returns:**
- Same-day void within the POS session: net out within the day's totals as long as the original ABB is voided per RD rules.
- Cross-session refund: issue a credit note. Credit note reduces current-month output VAT. Never silently delete the original sale.

### 2.4 Input VAT (purchases)

Reclaimable only against a **full tax invoice** that contains all required fields (RD-prescribed):
- Words "ใบกำกับภาษี" / "tax invoice" prominently displayed
- Supplier name, address, TIN
- Buyer name, address, TIN (the registrant's company)
- Sequential serial number
- Description, type, category, quantity, value of goods/services
- VAT amount shown separately from value
- Issue date
- "Head Office" or "Branch No. ..." designation for both supplier and buyer

Abbreviated tax invoices (ABBs) from suppliers do **not** support input VAT recovery. The system must flag purchases booked against ABBs as non-recoverable and warn the user to obtain a full tax invoice where applicable.

Input VAT cannot be reclaimed on:
- Entertainment expenses
- Cars with ≤10 seats (purchase or rental, with limited exceptions)
- Goods/services used for VAT-exempt activities
- Tax invoices >6 months old (with limited exceptions; must claim in same month or within 6 following months)

Excess input VAT (input > output): may be requested as cash refund on PP.30 or carried forward indefinitely. Cash refund triggers RD review, typically takes 3–6 months.

### 2.5 Tax invoice formats

| Type | Use | Buyer info required | Supports buyer input VAT? |
|---|---|---|---|
| **Full tax invoice** | B2B and any buyer who requests one | Yes (TIN, address, name) | Yes |
| **Abbreviated tax invoice (ABB)** | Retail B2C from approved cash register | No | No |
| **Credit note (ใบลดหนี้)** | Reduce previously-invoiced amount | Yes | Adjusts both sides |
| **Debit note (ใบเพิ่มหนี้)** | Increase previously-invoiced amount | Yes | Adjusts both sides |
| **e-Tax Invoice / e-Receipt** | Digital equivalent of full TI/receipt | Per full-TI rules | Yes |

ABB issuance via cash register requires prior **approval from the Director-General of the Revenue Department** under §86/6 and §86/7 of the Revenue Code. The system must be able to record and verify that each connected POS terminal has approval on file under the tenant's TIN.

ABB content requirements:
- "ใบกำกับภาษีอย่างย่อ" / "Abbreviated Tax Invoice" wording
- Supplier name (or abbreviated name) and TIN
- Sequential serial number
- Description, type, category of goods/services (codes acceptable if pre-registered with Director-General, 15 days notice)
- Total amount with VAT included; "Prices include VAT" statement
- Issue date

Daily aggregation: §86/6 permits accumulating daily sales into a single ABB at end-of-day for the output tax report, which is the standard pattern for high-volume retail.

Customer mid-transaction switch from ABB → full TI: legally required when buyer requests it. The POS workflow must support capturing buyer TIN/address and reissuing as full TI before closing the transaction.

### 2.6 PP.30 (monthly VAT return)

| Field | Value |
|---|---|
| Form | PP.30 (revised version effective 1 March 2026) |
| Frequency | Monthly (calendar month is the tax month) |
| Paper deadline | 15th of following month |
| e-filing deadline | 23rd of following month (8-day extension) |
| Required when | Always — including zero-activity months |
| Multiple branches | One PP.30 per place of business unless Director-General approves consolidation |

**PP.30 attachment.** From 1 March 2026 the revised PP.30 includes additional fields for amended-return tax calculations and PromptPay as the primary refund channel. Logic generating PP.30 output must conform to the new layout.

**Supporting reports** (Revenue Code §87, mandatory monthly maintenance):
- **Output tax report** (รายงานภาษีขาย) — every sale, ABB or full TI
- **Input tax report** (รายงานภาษีซื้อ) — every recoverable purchase
- **Goods and raw materials report** (รายงานสินค้าและวัตถุดิบ) — inventory in/out

These reports must reconcile to PP.30 line items. The system should generate them automatically from underlying transactions and present them as auditable artifacts.

### 2.7 PP.36 (reverse-charge VAT for foreign services)

Triggered when a Thai entity pays a foreign supplier for services consumed in Thailand. The Thai recipient self-assesses 7% VAT and remits via PP.36, separately from PP.30.

| Field | Value |
|---|---|
| Form | PP.36 |
| Paper deadline | 7th of following month |
| e-filing deadline | 15th of following month |
| Tax base | THB-equivalent of the foreign payment |
| Recovery | 7% remitted on PP.36 becomes input VAT on next PP.30 |

**Common PP.36 triggers in retail/SaaS context:**
- Meta/Google/TikTok ad spend (when billed by the foreign entity, not a Thai entity)
- Foreign SaaS subscriptions used in Thailand (Shopify, Stripe, AWS in some cases, Notion, Slack, Figma, etc.)
- Foreign consultants providing remote services to the Thai entity
- Royalties to foreign IP holders
- Foreign-issued software licenses

**Common false positives:**
- Services billed by a Thai-registered entity of the foreign vendor (already includes Thai VAT) — no PP.36
- Services used wholly outside Thailand — no PP.36
- Pure goods imports — VAT collected at customs, no PP.36

The system should classify every foreign-vendor payment as: (a) PP.36 due, (b) Thai-VAT-inclusive (no PP.36), or (c) goods import (customs VAT). This is the single most-missed compliance item for Thai SMEs.

### 2.8 VAT records retention

- Paper documents: minimum 5 years
- Electronic documents: minimum 10 years
- Records to retain: tax invoices (issued and received), credit/debit notes, output/input/inventory reports, PP.30/PP.36 returns and receipts, supporting bank/POS data

---

## 3. WHT framework

A retail entity is primarily a **WHT payer** (withholds from suppliers, remits to RD, issues certificates). Retail goods sales generally do not trigger WHT on the sale side — WHT applies to services, rent, royalties, certain commissions, dividends, interest, and similar.

### 3.1 Common WHT rates and forms (domestic)

| Payment type | Rate | Recipient type | Form | Notes |
|---|---|---|---|---|
| Salaries/wages | Progressive PIT | Employee | PND.1 | Plus PND.1 Kor annually |
| Professional services (legal, accounting, consulting, engineering) | 3% | Individual | PND.3 | |
| Professional services | 3% | Thai company | PND.53 | |
| Rent (immovable property) | 5% | Individual | PND.3 | Common: shop lease from individual landlord |
| Rent (immovable property) | 5% | Thai company | PND.53 | Mall/commercial landlord |
| Rent (movable property — equipment) | 5% | Either | PND.3/53 | |
| Advertising (Thai vendor) | 2% | Individual | PND.3 | |
| Advertising (Thai vendor) | 2% | Thai company | PND.53 | |
| Transportation (excluding common-carrier passenger) | 1% | Thai company | PND.53 | Logistics, courier |
| Construction, repair, maintenance | 3% | Individual or company | PND.3/53 | |
| Hire of work / contracting | 3% | Individual or company | PND.3/53 | |
| Royalties (patents, copyrights, software, trademarks) | 3% | Individual | PND.3 | |
| Royalties | 3% | Thai company | PND.53 | |
| Interest on loans (non-bank) | 1% | Thai company | PND.53 | |
| Dividends | 10% | Individual or company | PND.2 (individual) / PND.53 (company) | |
| Prizes, awards, contest winnings | 5% | Individual | PND.3 | |
| Insurance commissions | 3% | Individual | PND.3 | |

**No WHT scenarios** the system should explicitly recognize (to avoid false withholdings):
- Purchases of goods (retail or wholesale) — no WHT
- Payments to government bodies — generally no WHT
- Single-payment-per-payee aggregating < THB 1,000 in a tax year for services — exempt
- Common-carrier passenger transport (taxis, etc.) — no WHT

### 3.2 Cross-border WHT (PND.54)

For payments to foreign payees without Thai PE. Default rates per Revenue Code §70, modifiable by Double Tax Treaties (DTAs).

| Payment type | Default rate | Common DTA-modified rate |
|---|---|---|
| Service fees | 15% | Often 0% under DTAs if no Thai PE |
| Royalties | 15% | 5–15% per DTA |
| Interest | 15% | 10–15% per DTA |
| Dividends | 10% | 5–10% per DTA |
| Branch profit remittance | 10% | 10% (PND.54) |

DTA application requires the foreign recipient's tax residency certificate from their home country, dated and applicable to the payment year. The system should track which payees have valid TRCs on file and warn before applying treaty rates without one.

### 3.3 Filing deadlines (all PND.x WHT forms)

| Form | What | Paper | e-Filing |
|---|---|---|---|
| PND.1 | Salary WHT | 7th of next month | 15th of next month |
| PND.2 | Dividends/interest/etc. to individuals | 7th | 15th |
| PND.3 | Service WHT — individuals | 7th | 15th |
| PND.53 | Service WHT — Thai companies | 7th | 15th |
| PND.54 | Cross-border WHT | 7th | 15th |
| PND.1 Kor | Annual salary WHT summary | End of February | End of February (no extension) |

The 8-day e-filing extension is granted under a Ministry of Finance announcement covering 1 February 2024 → 31 January 2027. Logic must be configurable; the extension may not be renewed.

### 3.4 WHT certificate (50 ทวิ / "Tawi")

For every withholding event the payer MUST issue a withholding tax certificate to the payee. The payee uses this to credit against their own income tax. Failure to issue is a penalty event independent of the WHT itself.

Required content:
- Sequential certificate number
- Payer name, address, TIN
- Payee name, address, TIN (or ID number for individuals)
- Type and date of payment
- Gross amount, WHT rate, WHT amount, net paid
- "หัก ณ ที่จ่าย" / "Withholding at source" wording
- Form reference (PND.1/3/53/54)
- Signature

The system must generate certificates automatically alongside each WHT booking and make them retrievable by payee, period, and form. PND submissions must reconcile to the certificates issued in that period.

### 3.5 e-Withholding Tax (e-WHT)

An alternative regime where WHT is remitted via authorized banks at the point of payment. Benefits:
- Reduced rate to 1% on certain qualifying payments (currently extended through 31 December 2027 — verify against current RD announcements)
- No certificate-issuance burden (bank issues digital certificate)
- Simpler reconciliation

The system should support both regimes and flag payees/transactions eligible for e-WHT.

---

## 4. Annual and semi-annual filings

| Form | What | Deadline |
|---|---|---|
| **PND.51** | Semi-annual CIT prepayment based on estimated annual profit | Within 2 months of half-year end (+ 8 days e-filing) |
| **PND.50** | Annual CIT return | Within 150 days of fiscal year-end (158 days e-filing for tax years 2024–2027) |
| **PND.1 Kor** | Annual salary WHT summary per employee | End of February (covering prior calendar year) |
| **DBD financials** | Audited financial statements filed with Department of Business Development | Within 1 month of AGM; AGM within 4 months of fiscal year-end |
| **Transfer pricing disclosure form** | Required for entities with revenue > THB 200M | With PND.50 |

CIT rates (standard, juristic person, non-BOI):
- SME (paid-up capital ≤ THB 5M and revenue ≤ THB 30M): 0% on first THB 300k, 15% on THB 300k–3M, 20% above THB 3M
- Standard companies: 20% flat
- BOI-promoted activities: per BOI certificate (often 0% for a defined period)

The system should compute estimated half-year profit for PND.51 and warn the user if estimate is materially below 50% of the eventual full-year profit (under-estimation by >25% triggers a 20% penalty on the underpayment).

---

## 5. Reconciliation logic and journal entry templates

### 5.1 The clearing-account model

For each payment channel, define a clearing account:
- `1141 Cash on hand`
- `1142 Cash in transit (to bank)`
- `1151 Card receivable — Bank A`
- `1152 Card receivable — Bank B`
- `1161 QR receivable — TrueMoney`
- `1162 QR receivable — Rabbit LINE Pay`
- `1171 Marketplace receivable — Shopee`
- `1172 Marketplace receivable — Lazada`
- `1181 Delivery platform receivable — Grab`
- (etc.)

Each sale debits the appropriate clearing account; each settlement deposit clears it. The agent's primary reconciliation check: each clearing account balance should be the sum of unsettled sales (today + within the channel's settlement window). Anything older is an exception.

### 5.2 Journal entry templates

#### Cash sale (THB 1,070 with VAT-inclusive pricing, 7% rate)

```
Dr  1141 Cash on hand                  1,070.00
    Cr  4101 Sales                                1,000.00
    Cr  2151 Output VAT payable                      70.00
```

#### Card sale via Bank A (gross 1,070, MDR 2.0% = 21.40, processor charges 7% VAT on its fee = 1.498)

At point of sale:
```
Dr  1151 Card receivable — Bank A      1,070.00
    Cr  4101 Sales                                1,000.00
    Cr  2151 Output VAT payable                      70.00
```

At settlement (gross 1,070 less processor fee + VAT on fee = 1,047.10 net deposit; processor issues tax invoice for 21.40 + 1.50 VAT):
```
Dr  1101 Bank — Bank A                  1,047.10
Dr  5601 Processor fees expense            21.40
Dr  1251 Input VAT recoverable              1.50
    Cr  1151 Card receivable — Bank A             1,070.00
```

#### QR sale via TrueMoney (gross 1,070, fee 0.5% = 5.35, VAT-exempt fee — many wallet fees are exempt; verify per provider)

```
Dr  1161 QR receivable — TrueMoney     1,070.00
    Cr  4101 Sales                                1,000.00
    Cr  2151 Output VAT payable                      70.00

[At settlement]
Dr  1101 Bank                           1,064.65
Dr  5602 Wallet fees expense                5.35
    Cr  1161 QR receivable — TrueMoney            1,070.00
```

#### Marketplace sale via Shopee (gross 1,070, commission 8% = 85.60 + 7% VAT on commission = 5.99)

```
[Sale recognized when order ships / fulfilled]
Dr  1171 Marketplace receivable — Shopee  1,070.00
    Cr  4101 Sales                                1,000.00
    Cr  2151 Output VAT payable                      70.00

[Settlement with platform commission]
Dr  1101 Bank                              978.41
Dr  5603 Marketplace commission             85.60
Dr  1251 Input VAT recoverable               5.99
    Cr  1171 Marketplace receivable — Shopee      1,070.00
```

#### Refund via credit note (THB 1,070 returned)

```
Dr  4101 Sales                          1,000.00
Dr  2151 Output VAT payable                70.00
    Cr  1141 Cash on hand                         1,070.00
    [or Cr the appropriate refund channel]
```

The credit note number must be linked to the original ABB/full TI number in the output tax report.

#### Service payment to Thai company (THB 10,700 invoice including 7% VAT, 3% WHT applied to the THB 10,000 ex-VAT base)

```
Dr  6101 Service expense               10,000.00
Dr  1251 Input VAT recoverable            700.00
    Cr  2152 WHT payable — PND.53                    300.00
    Cr  2101 Accounts payable / 1101 Bank         10,400.00
```

Issue WHT certificate referencing PND.53. The 300.00 remits with the next PND.53 filing.

#### Salary payment to employee (gross 50,000, PIT WHT 2,000, employee SSO 750, employer SSO 750)

```
Dr  6201 Salary expense                50,000.00
Dr  6202 Employer SSO contribution         750.00
    Cr  2153 PIT WHT payable — PND.1               2,000.00
    Cr  2154 SSO payable (employee + employer)     1,500.00
    Cr  1101 Bank (net pay)                       47,250.00
```

PND.1 remits the 2,000.00; SSO Form Sor.Por.So.1-10 remits the 1,500.00 (within 15th of following month).

### 5.3 Reconciliation invariants

The agent should enforce these invariants on every period:

1. **Channel clearing reconciliation:** for each clearing account, balance ≤ sum of unsettled sales within the documented settlement SLA. Aged items beyond SLA flagged.
2. **Cash drawer reconciliation:** opening cash + cash sales − refunds − bank deposits − petty cash − closing cash = 0 (variance booked to a small variance account, alerted if exceeds threshold).
3. **PP.30 sales tie:** sum of output VAT in output tax report = output VAT line on PP.30 = sum of (sales × applicable rate) per POS data, less credit notes, plus debit notes.
4. **PP.30 input tie:** sum of input VAT in input tax report = input VAT line on PP.30. Each entry must reference a full tax invoice.
5. **PP.36 → PP.30 input tie:** PP.36 remitted in month N appears as input VAT on PP.30 of month N (or N+1, depending on payment date and supplier invoice).
6. **WHT register tie:** sum of WHT certificates issued in period = total WHT remitted on PND.x for that period.
7. **Bank balance tie:** ledger bank balance = bank statement closing balance, with reconciling items aged < 30 days.
8. **Period boundary check:** no sale dated in month N appears in PP.30 for month N+1 unless an explicit reason code is set (e.g. late capture with audit trail).

### 5.4 Edge cases the agent must handle

- **POS captures sale at 23:55 on 31 March, settles at 02:00 on 1 April:** sale in March VAT month, settlement in April. Two months involved; clearing account spans the boundary. Common at month-ends; do not let the bank-feed-driven workflow reclassify it.
- **Customer pays cash, says "I want a tax invoice" mid-transaction:** POS must support upgrade ABB → full TI before close. If close has happened, full TI may be issued referencing the ABB number; both are recorded but VAT base counted once.
- **Tip / service charge:** if separately stated and not consideration for the supply, may be outside VAT scope — but most retail/F&B treats service charge as part of consideration (VAT applies). Configurable per tenant.
- **Corporate gift / staff meal / sample:** deemed supply rules under Revenue Code §77/1(8); tax base may apply at market value. Flag any non-revenue dispatch of stock.
- **Returned goods after VAT month closed:** issue credit note in current month. Do **not** reverse the original month's PP.30.
- **Lost ABB / printer fault:** must be voided in the system with audit trail; serial gap explained in output tax report.
- **Foreign currency sale (e.g. tourist paying in USD):** convert to THB at the BOT reference rate on the sale date; tax base is THB-equivalent.
- **Discount voucher / cashback:** vendor-funded discount reduces tax base if shown on TI; third-party-funded discount (e.g. credit card promo) does not reduce the tax base because the merchant still receives full consideration.
- **Gift cards / pre-paid vouchers:** VAT applies at redemption (when goods/services are delivered), not at sale of the voucher (which is a financial liability until redeemed). Common audit finding for retail chains.
- **B2B credit sales settled later:** AR in clearing account may legitimately age 30/60/90 days. Use a separate AR aging report; not a settlement defect.

---

## 6. Salary and payroll integration (planned)

The salary module must produce, per pay period:

### 6.1 Per-employee withholding calculation

Progressive PIT scale (current bands; configurable):

| Annual taxable income (THB) | Marginal rate |
|---|---|
| 0 – 150,000 | 0% (exempt) |
| 150,001 – 300,000 | 5% |
| 300,001 – 500,000 | 10% |
| 500,001 – 750,000 | 15% |
| 750,001 – 1,000,000 | 20% |
| 1,000,001 – 2,000,000 | 25% |
| 2,000,001 – 5,000,000 | 30% |
| > 5,000,000 | 35% |

Standard deductions and allowances (2026; configurable):
- Employment expense deduction: 50% of salary, capped at THB 100,000
- Personal allowance: THB 60,000
- Spouse allowance (non-earning): THB 60,000
- Child allowance: THB 30,000 per child (THB 60,000 for second+ child born from 2018)
- Parent allowance: THB 30,000 per parent (income test)
- LTF/RMF/SSF, life insurance, health insurance, mortgage interest, etc.: per current limits

WHT per pay period (monthly):
```
Estimated annual taxable income = (gross monthly × 12) − annual deductions/allowances
Estimated annual PIT             = sum over progressive bands
Monthly WHT                      = estimated annual PIT ÷ pay periods (12)
```

The system must allow employees to submit Form Lor.Yor.01 (allowance declaration) annually so the calculation can use accurate allowances. Mid-year changes (marriage, birth, etc.) require recalculation from that month forward.

### 6.2 Social Security Office (SSO) contributions

- **Rate:** 5% of insurable wages, employee + 5% employer, capped at insurable wage of THB 15,000 → max THB 750 per side per month. Rate cap may change; configurable. (Note: the insurable wage cap is undergoing legislative changes — verify the current cap each pay period from RD/SSO sources.)
- **Form:** Sor.Por.So.1-10
- **Deadline:** 15th of following month
- **Filing:** SSO portal, separate from RD

### 6.3 PND.1 (monthly) and PND.1 Kor (annual)

PND.1 reports the WHT withheld in the month from all employees. PND.1 Kor is the annual summary per employee, due end of February covering the prior calendar year. The system must be able to produce both.

### 6.4 Provident fund and other deductions

If the company runs a provident fund, employee contributions are deductible from PIT (within limits). Employer contributions are corporate-deductible but not taxable on the employee until received. System must support tracking both.

---

## 7. Validation rules: what the agent must check

The agent should run the following classes of checks against any month being closed or filed:

### 7.1 VAT integrity
- [ ] Output VAT base = POS gross sales (not bank net, not POS-net-of-discount-after-the-fact).
- [ ] Every sale has an ABB or full TI number; serials are sequential within each terminal.
- [ ] Credit notes link to original TI; same-period and prior-period credit notes handled correctly.
- [ ] Input VAT only claimed against full TIs in the company's name with all required fields.
- [ ] PP.36 raised for every foreign-vendor service payment in scope; corresponding input VAT claimed in correct PP.30.
- [ ] No claim for input VAT > 6 months old without explicit override and reason.
- [ ] Output tax report, input tax report, and PP.30 reconcile to the THB.
- [ ] PP.30 form version matches current RD-published version (post-1 March 2026 layout).
- [ ] Zero-activity month: PP.30 still filed.

### 7.2 WHT integrity
- [ ] Every payment classified for WHT applicability before remittance to vendor.
- [ ] Correct form/rate based on payee type (individual/Thai company/foreign) and payment category.
- [ ] WHT certificate generated and retrievable for every withheld payment.
- [ ] Sum of WHT certificates issued in period = WHT remitted on PND.x.
- [ ] No withholding on goods purchases (false-positive check).
- [ ] DTA reduced rates only applied where TRC is on file.
- [ ] Below-THB-1,000 single-payment-aggregate exemption applied correctly for service payments to one payee.

### 7.3 Reconciliation integrity
- [ ] Each clearing account aged: no items older than channel SLA without explanation.
- [ ] Cash drawer variance within tolerance.
- [ ] Bank ledger reconciles to bank statement.
- [ ] Sale date (POS) determines VAT month, not deposit date (bank).
- [ ] Refunds processed via credit note in current month, not by reversing prior period.

### 7.4 Calendar integrity
- [ ] PP.30 filed by 23rd (e-file) or 15th (paper) of following month.
- [ ] PP.36 filed by 15th (e-file) or 7th (paper) of following month.
- [ ] PND.1/3/53/54 filed by 15th (e-file) or 7th (paper) of following month.
- [ ] Payment cleared on or before filing date — surcharge accrues from due date if late.
- [ ] PND.51 filed within 2 months + 8 days of half-year end.
- [ ] PND.50 filed within 158 days of fiscal year-end.
- [ ] PND.1 Kor filed by end of February.
- [ ] DBD financial statements filed within 1 month of AGM; AGM within 4 months of FY-end.

### 7.5 Approval/registration integrity
- [ ] Each connected POS terminal has Director-General approval on file for issuing ABBs.
- [ ] Tenant TIN active in RD VAT registration; VAT 01 / VAT 20 on file.
- [ ] e-Tax Invoice/e-Receipt registration on file if used.
- [ ] e-Filing registration with RD and Ministry of Finance current.

---

## 8. Penalty and surcharge framework

### 8.1 VAT (PP.30 / PP.36)

| Failure | Penalty | Surcharge | Late-filing fine |
|---|---|---|---|
| Late filing with no tax due | Nil | Nil | THB 300 (≤7 days) / THB 500 (>7 days) |
| Failure to file at all | 200% of tax payable | 1.5%/month or fraction (capped at tax amount) | THB 500+ |
| Filed but understated (audit-detected) | 100% of additional tax | 1.5%/month | — |
| Filed but understated (voluntary amendment, additional PP.30 ก) | Reduced — graduated by lateness, max 20% | 1.5%/month | — |
| Issuing tax invoice without right / using false TI | 200% of tax shown + criminal liability | 1.5%/month | — |
| Failure to issue tax invoice | THB 2,000/occurrence | — | — |
| Failure to keep records | Up to THB 2,000 + adverse audit presumption | — | — |

Voluntary amendment penalty schedule (filed before audit notice):
- Within 7 days of due date: ~2% of additional tax
- 8–30 days: ~5%
- 31–60 days: ~10%
- > 60 days: up to 20%

Surcharge always applies, calculated from the original due date to the date of payment, capped at the tax amount itself.

### 8.2 WHT (PND.x)

- Late filing with no WHT due: ~THB 100–200 fine.
- Late filing with WHT due: 1.5%/month surcharge on the WHT amount + penalty up to 100% of WHT (voluntary amendment significantly reduces this).
- Failure to withhold: payer becomes jointly liable for the tax that should have been withheld plus surcharge plus penalty.
- Failure to issue certificate: separate fine + payee may not be able to credit, creating dispute exposure.

### 8.3 CIT (PND.50/51)

- Late PND.50: 1.5%/month surcharge + penalty up to 200% of tax (reduced for voluntary amendment).
- Under-estimation on PND.51 by > 25% of full-year tax: 20% penalty on the under-payment.

### 8.4 Records / audit defence
- Retention: 5 years paper, 10 years electronic.
- Failure to produce records during audit creates an adverse presumption — RD assesses on best available information, typically higher than actual.
- Voluntary correction before audit notice consistently reduces civil penalty exposure dramatically; criminal exposure depends on intent (Section 59 Criminal Code) and is not automatic.

---

## 9. Configuration data the system must keep current

The following must be configurable per tenant and reviewed at least annually:

- **VAT rate** (currently 7%; statutory 10%; check for Royal Decree extensions past 30 Sep 2026)
- **VAT registration threshold** (currently THB 1.8M)
- **WHT rates** (per category, per payee type)
- **e-WHT 1% extension status** (currently through 31 Dec 2027 for qualifying payments — verify)
- **PIT bands and personal allowances**
- **SSO insurable wage cap and contribution rate**
- **e-Filing extension period** (currently through 31 January 2027 — Ministry of Finance announcement)
- **PP.30 form version** (revised version effective 1 March 2026)
- **CIT SME thresholds** (paid-up capital, revenue) and rates
- **DTA-modified WHT rates** per country, with TRC requirement flagged
- **BOI status and certificate terms** if applicable

The system should subscribe to or scrape RD announcements and surface changes for review rather than hard-coding.

---

## 10. Out-of-scope (for now) but flag if encountered

- **SBT-liable activities** (banking, insurance, real estate, factoring, pawn) — separate regime, PT.40 monthly.
- **Excise tax** (alcohol, tobacco, vehicles, beverages, etc.) — separate regime, filed with Excise Department.
- **Customs duties** for imports — separate regime.
- **Land and Building Tax** — annual, paid to local administrative organization.
- **Signboard Tax** — annual, local.
- **Stamp Duty** — per-instrument basis (loan agreements, leases, etc.).
- **Transfer pricing documentation** — required for entities with revenue > THB 200M.
- **Country-by-Country Reporting** — for MNEs with consolidated revenue > THB 28B.

If the tenant's data suggests any of these apply, the agent should flag rather than attempt to handle.

---

## 11. Sources and authority

Primary:
- Thai Revenue Code, Title 4 (Value Added Tax), §§77 onwards
- Thai Revenue Department published forms, instructions, and tax calendar (rd.go.th)
- Royal Decrees extending the reduced VAT rate (most recent: Royal Decree No. 799, B.E. 2568)
- Ministry of Finance announcement on e-filing extension (1 February 2024 – 31 January 2027)

Secondary (for interpretation):
- RD Director-General notifications (Por. orders) on tax invoices, ABBs, cash registers
- Departmental instructions on PP.36 reverse charge

When in doubt, the agent should defer to the primary sources or recommend that the user obtain a Thai CPA opinion. This document is a working reference, not legal advice.