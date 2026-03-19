import { describe, it, expect } from "vitest";
import { parseKBankPdfText, detectKBankPdf } from "./kbank-pdf-parser";

// ---------------------------------------------------------------------------
// Minimal page text fixtures (modeled from real KBank PDF text extraction)
// ---------------------------------------------------------------------------

const PAGE_1 = `ที่ DD.048 : N26030212060273863618O/2569
ชื่อบัญชี บจก. ทดสอบ (ประเทศไทย)
540 ห้อง1155 อค.เมอร์คิวรี่ทาวเวอร์ ชั้น11 ลุมพินี กทม. 10330
1/2(0787)
สาขาเซ็นทรัลเอ็มบาสซี
210-8-48789-8
26030212060273863618
01/01/2026 - 31/01/2026
เลขที่บัญชีเงินฝาก
สาขาเจ้าของบัญชี
เลขที่อ้างอิง
รอบระหว่างวันที่
31,500.00
58,500.00
รวมถอนเงิน 4 รายการ
รวมฝากเงิน 2 รายการ
ยอดยกไป
77,000.00
หน้าที่ (PAGE/OF) 1/2
วันที่ เวลา/
วันที่มีผล ถอนเงิน / ฝากเงิน ช่องทาง\tรายการ ยอดคงเหลือ
(บาท) รายละเอียด
01-01-26 50,000.00\tยอดยกมา
01-01-26 19:33 K BIZ\t100,000.00 จาก X6898 บจก. ทดสอบ (ประเ++\tรับโอนเงิน 50,000.00
05-01-26 15:59 K BIZ\t99,030.00 โอนไป พร้อมเพย์ X6160 บริษัท ดิน ปริ้นท์++\tโอนเงิน 970.00
07-01-26 20:28 K BIZ\t98,265.00 โอนไป X2289 น.ส. ศศมน ประภพรัต++\tโอนเงิน 765.00
12-01-26 01:17 ธุรกรรมต่างประเทศ\t68,507.00 Trade Ref no. OR26011200000005\tหักเงินธุรกรรม ตปท. 29,758.00
KBPDF (FM702-CA_SA-V.1) (03-25)
ออกโดย K BIZ`;

const PAGE_2 = `ที่ DD.048 : N26030212060273863618O/2569
ชื่อบัญชี บจก. ทดสอบ (ประเทศไทย)
540 ห้อง1155 อค.เมอร์คิวรี่ทาวเวอร์ ชั้น11 ลุมพินี กทม. 10330
2/2(0787)
สาขาเซ็นทรัลเอ็มบาสซี
210-8-48789-8
26030212060273863618
01/01/2026 - 31/01/2026
เลขที่บัญชีเงินฝาก
สาขาเจ้าของบัญชี
เลขที่อ้างอิง
รอบระหว่างวันที่
หน้าที่ (PAGE/OF) 2/2
วันที่ เวลา/
วันที่มีผล ถอนเงิน / ฝากเงิน ช่องทาง\tรายการ ยอดคงเหลือ
(บาท) รายละเอียด
12-01-26 68,507.00\tยอดยกมา
15-01-26 22:27 K BIZ\t68,500.00 โอนไป X9393 น.ส. ศลิษา หวังเอื++\tโอนเงิน 7.00
20-01-26 18:46 K BIZ\t95,500.00 จาก X6898 บจก. ทดสอบ (ประเ++\tรับโอนเงิน 27,000.00
KBPDF (FM702-CA_SA-V.1) (03-25)
ออกโดย K BIZ
สอบถามข้อมูลเพิ่มเติม บุคคลธรรมดา K Contact Center 02-8888888`;

// Multi-line transaction page (payment wrapping to next lines)
const PAGE_MULTILINE = `ที่ DD.048 : N26030212060273863618O/2569
ชื่อบัญชี บจก. ทดสอบ (ประเทศไทย)
1/1(0787)
สาขาเซ็นทรัลเอ็มบาสซี
210-8-48789-8
26030212060273863618
01/02/2026 - 28/02/2026
เลขที่บัญชีเงินฝาก
สาขาเจ้าของบัญชี
เลขที่อ้างอิง
รอบระหว่างวันที่
5,367.67
0.00
รวมถอนเงิน 2 รายการ
รวมฝากเงิน 0 รายการ
ยอดยกไป
94,632.33
หน้าที่ (PAGE/OF) 1/1
วันที่ เวลา/
วันที่มีผล ถอนเงิน / ฝากเงิน ช่องทาง\tรายการ ยอดคงเหลือ
(บาท) รายละเอียด
01-02-26 100,000.00\tยอดยกมา
15-02-26 22:27 K BIZ\t96,632.33 เพื่อชำระ Ref X2529 กรมสรรพากรเพื่อรับชำระ
ภาษีผ่านอินเทอร์เน็ต
ชำระเงิน 3,367.67
26-02-26 14:26 K BIZ\t94,632.33 เพื่อชำระ KTB Ref X0591 ชำระเงินสมทบมาตรา
33 สปส.
ชำระเงิน 2,000.00
KBPDF (FM702-CA_SA-V.1) (03-25)
ออกโดย K BIZ`;

describe("detectKBankPdf", () => {
  it("detects KBank PDF by KBPDF marker + account pattern", () => {
    expect(detectKBankPdf(PAGE_1)).toBe(true);
  });

  it("detects KBank PDF by ออกโดย K BIZ + account pattern", () => {
    const text = "ออกโดย K BIZ\n210-8-48789-8";
    expect(detectKBankPdf(text)).toBe(true);
  });

  it("rejects text without markers", () => {
    expect(detectKBankPdf("random text\n210-8-48789-8")).toBe(false);
  });

  it("rejects text with marker but no account pattern", () => {
    expect(detectKBankPdf("KBPDF some text")).toBe(false);
  });
});

describe("parseKBankPdfText — header extraction", () => {
  it("extracts account number", () => {
    const { meta } = parseKBankPdfText([PAGE_1]);
    expect(meta.accountNumber).toBe("210-8-48789-8");
  });

  it("extracts account name", () => {
    const { meta } = parseKBankPdfText([PAGE_1]);
    expect(meta.accountName).toBe("บจก. ทดสอบ (ประเทศไทย)");
  });

  it("extracts branch", () => {
    const { meta } = parseKBankPdfText([PAGE_1]);
    expect(meta.branch).toBe("สาขาเซ็นทรัลเอ็มบาสซี");
  });

  it("extracts period start/end in ISO format", () => {
    const { meta } = parseKBankPdfText([PAGE_1]);
    expect(meta.period.start).toBe("2026-01-01");
    expect(meta.period.end).toBe("2026-01-31");
  });

  it("sets bankCode to KBANK", () => {
    const { meta } = parseKBankPdfText([PAGE_1]);
    expect(meta.bankCode).toBe("KBANK");
  });
});

describe("parseKBankPdfText — summary extraction", () => {
  it("extracts withdrawal/deposit counts", () => {
    const { meta } = parseKBankPdfText([PAGE_1]);
    expect(meta.totals.withdrawalCount).toBe(4);
    expect(meta.totals.depositCount).toBe(2);
  });

  it("extracts withdrawal/deposit totals", () => {
    const { meta } = parseKBankPdfText([PAGE_1, PAGE_2]);
    expect(meta.totals.withdrawalAmount).toBe("31500.00");
    expect(meta.totals.depositAmount).toBe("77000.00");
  });

  it("extracts closing balance", () => {
    const { meta } = parseKBankPdfText([PAGE_1, PAGE_2]);
    expect(meta.totals.closingBalance).toBe("58500.00");
  });
});

describe("parseKBankPdfText — transaction parsing", () => {
  it("parses correct number of transactions", () => {
    const { result } = parseKBankPdfText([PAGE_1, PAGE_2]);
    // 4 on page 1 + 2 on page 2 = 6 (carry-forwards excluded)
    expect(result.transactions).toHaveLength(6);
  });

  it("skips carry-forward (ยอดยกมา) lines", () => {
    const { result } = parseKBankPdfText([PAGE_1, PAGE_2]);
    const descriptions = result.transactions.map((t) => t.description);
    expect(descriptions.some((d) => d.includes("ยอดยกมา"))).toBe(false);
  });

  it("extracts opening balance from first page carry-forward", () => {
    const { result } = parseKBankPdfText([PAGE_1, PAGE_2]);
    expect(result.openingBalance).toBe("50000.00");
  });

  it("parses credit (deposit) transactions", () => {
    const { result } = parseKBankPdfText([PAGE_1]);
    const credits = result.transactions.filter((t) => t.type === "credit");
    expect(credits).toHaveLength(1);
    expect(credits[0].amount).toBe("50000.00");
    expect(credits[0].description).toContain("Transfer Deposit");
  });

  it("parses debit (withdrawal) transactions", () => {
    const { result } = parseKBankPdfText([PAGE_1]);
    const debits = result.transactions.filter((t) => t.type === "debit");
    expect(debits).toHaveLength(3);
    expect(debits[0].amount).toBe("970.00");
  });

  it("parses international transaction", () => {
    const { result } = parseKBankPdfText([PAGE_1]);
    const intl = result.transactions.find((t) =>
      t.description?.includes("International")
    );
    expect(intl).toBeDefined();
    expect(intl!.amount).toBe("29758.00");
    expect(intl!.type).toBe("debit");
    expect(intl!.channel).toBe("International Transaction");
  });

  it("extracts running balance for each transaction", () => {
    const { result } = parseKBankPdfText([PAGE_1]);
    expect(result.transactions[0].runningBalance).toBe("100000.00");
    expect(result.transactions[1].runningBalance).toBe("99030.00");
  });

  it("extracts channel names", () => {
    const { result } = parseKBankPdfText([PAGE_1]);
    expect(result.transactions[0].channel).toBe("K BIZ");
  });

  it("extracts counterparty details", () => {
    const { result } = parseKBankPdfText([PAGE_1]);
    expect(result.transactions[0].counterparty).toContain("บจก. ทดสอบ");
  });

  it("generates unique external refs", () => {
    const { result } = parseKBankPdfText([PAGE_1, PAGE_2]);
    const refs = result.transactions.map((t) => t.externalRef);
    const unique = new Set(refs);
    expect(unique.size).toBe(refs.length);
  });

  it("translates ธุรกรรมต่างประเทศ channel", () => {
    const { result } = parseKBankPdfText([PAGE_1]);
    const intl = result.transactions.find((t) => t.amount === "29758.00");
    expect(intl!.channel).toBe("International Transaction");
  });
});

describe("parseKBankPdfText — multi-line transactions", () => {
  it("parses multi-line payment transactions", () => {
    const { result } = parseKBankPdfText([PAGE_MULTILINE]);
    expect(result.transactions).toHaveLength(2);
  });

  it("extracts correct amounts from multi-line", () => {
    const { result } = parseKBankPdfText([PAGE_MULTILINE]);
    expect(result.transactions[0].amount).toBe("3367.67");
    expect(result.transactions[1].amount).toBe("2000.00");
  });

  it("translates payment type correctly", () => {
    const { result } = parseKBankPdfText([PAGE_MULTILINE]);
    expect(result.transactions[0].description).toContain("Payment");
    expect(result.transactions[0].type).toBe("debit");
  });

  it("joins multi-line details", () => {
    const { result } = parseKBankPdfText([PAGE_MULTILINE]);
    // Details should contain the payment reference and wrapped text
    expect(result.transactions[0].counterparty).toContain("กรมสรรพากร");
  });

  it("extracts opening balance from multi-line page", () => {
    const { result } = parseKBankPdfText([PAGE_MULTILINE]);
    expect(result.openingBalance).toBe("100000.00");
  });
});

describe("parseKBankPdfText — multi-page", () => {
  it("merges transactions across pages", () => {
    const { result } = parseKBankPdfText([PAGE_1, PAGE_2]);
    expect(result.transactions).toHaveLength(6);
    // Verify chronological order
    expect(result.transactions[0].date).toBe("2026-01-01");
    expect(result.transactions[5].date).toBe("2026-01-20");
  });

  it("uses period from header, not transaction dates", () => {
    const { result } = parseKBankPdfText([PAGE_1, PAGE_2]);
    expect(result.periodStart).toBe("2026-01-01");
    expect(result.periodEnd).toBe("2026-01-31");
  });

  it("no errors when transaction count matches summary", () => {
    const { result } = parseKBankPdfText([PAGE_1, PAGE_2]);
    expect(result.errors).toHaveLength(0);
  });
});

describe("parseKBankPdfText — balance validation", () => {
  it("running balance is consistent with opening + transactions", () => {
    const { result } = parseKBankPdfText([PAGE_1, PAGE_2]);
    const opening = parseFloat(result.openingBalance!);
    let running = opening;
    for (const txn of result.transactions) {
      const amt = parseFloat(txn.amount);
      running += txn.type === "credit" ? amt : -amt;
      if (txn.runningBalance) {
        expect(Math.abs(running - parseFloat(txn.runningBalance))).toBeLessThan(
          0.01
        );
      }
    }
  });
});

describe("parseKBankPdfText — Thai descriptions map", () => {
  it("stores Thai descriptions keyed by externalRef", () => {
    const { result, thaiDescriptions } = parseKBankPdfText([PAGE_1]);
    const firstRef = result.transactions[0].externalRef;
    expect(thaiDescriptions[firstRef]).toBeDefined();
    expect(thaiDescriptions[firstRef].type).toBe("รับโอนเงิน");
  });

  it("stores details in Thai descriptions", () => {
    const { result, thaiDescriptions } = parseKBankPdfText([PAGE_1]);
    const intlTxn = result.transactions.find((t) =>
      t.description?.includes("International")
    );
    expect(thaiDescriptions[intlTxn!.externalRef].details).toContain(
      "Trade Ref"
    );
  });
});
