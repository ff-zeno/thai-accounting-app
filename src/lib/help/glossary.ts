import type { Localized } from "./content";

export interface GlossaryEntry {
  term: Localized;
  definition: Localized;
}

/**
 * Bilingual glossary of Thai tax and app terms. Help entries reference
 * these by key via `HelpEntry.terms`; the help sidebar renders them as a
 * footer under the page's content.
 */
export const HELP_GLOSSARY: Record<string, GlossaryEntry> = {
  wht: {
    term: { en: "WHT (withholding tax)", th: "ภาษีหัก ณ ที่จ่าย" },
    definition: {
      en: "Tax deducted at source when paying for services, remitted to the Revenue Department on the payee's behalf.",
      th: "ภาษีที่ผู้จ่ายหักไว้จากยอดจ่ายค่าบริการ แล้วนำส่งกรมสรรพากรแทนผู้รับเงิน",
    },
  },
  "fifty-tawi": {
    term: { en: "50 Tawi certificate", th: "หนังสือรับรอง 50 ทวิ" },
    definition: {
      en: "Official certificate documenting tax withheld, issued to the payee, who uses it as a tax credit on their own return.",
      th: "หนังสือรับรองการหักภาษี ณ ที่จ่ายที่ผู้จ่ายออกให้ผู้รับเงิน ผู้รับใช้เป็นเครดิตภาษีในแบบของตนเอง",
    },
  },
  pnd1: {
    term: { en: "PND 1 (ภ.ง.ด.1)", th: "ภ.ง.ด.1" },
    definition: {
      en: "Monthly return of tax withheld from employee salaries.",
      th: "แบบนำส่งภาษีที่หักจากเงินเดือนพนักงาน ยื่นเป็นรายเดือน",
    },
  },
  pnd3: {
    term: { en: "PND 3 (ภ.ง.ด.3)", th: "ภ.ง.ด.3" },
    definition: {
      en: "Monthly withholding tax return for payments to individuals.",
      th: "แบบนำส่งภาษีหัก ณ ที่จ่ายรายเดือน สำหรับการจ่ายให้บุคคลธรรมดา",
    },
  },
  pnd53: {
    term: { en: "PND 53 (ภ.ง.ด.53)", th: "ภ.ง.ด.53" },
    definition: {
      en: "Monthly withholding tax return for payments to Thai companies.",
      th: "แบบนำส่งภาษีหัก ณ ที่จ่ายรายเดือน สำหรับการจ่ายให้นิติบุคคลไทย",
    },
  },
  pp30: {
    term: { en: "PP 30 (ภ.พ.30)", th: "ภ.พ.30" },
    definition: {
      en: "Monthly VAT return netting output VAT against input VAT. Must be filed every month, even with no activity.",
      th: "แบบแสดงรายการภาษีมูลค่าเพิ่มรายเดือน หักกลบภาษีขายกับภาษีซื้อ ต้องยื่นทุกเดือนแม้ไม่มีรายการ",
    },
  },
  pp36: {
    term: { en: "PP 36 (ภ.พ.36)", th: "ภ.พ.36" },
    definition: {
      en: "Self-assessed VAT remitted when paying foreign service providers. Separate from PP 30 — claimable as input VAT only after remittance, in a later month.",
      th: "แบบนำส่งภาษีมูลค่าเพิ่มแทนผู้ให้บริการต่างประเทศ แยกจาก ภ.พ.30 และใช้เป็นภาษีซื้อได้เฉพาะหลังนำส่งเงินแล้ว ในเดือนถัดไปเท่านั้น",
    },
  },
  "output-vat": {
    term: { en: "Output VAT", th: "ภาษีขาย" },
    definition: {
      en: "VAT you collect from customers on sales.",
      th: "ภาษีมูลค่าเพิ่มที่เรียกเก็บจากลูกค้าเมื่อขายสินค้าหรือบริการ",
    },
  },
  "input-vat": {
    term: { en: "Input VAT", th: "ภาษีซื้อ" },
    definition: {
      en: "VAT you pay suppliers on purchases; creditable against output VAT when you hold a full tax invoice.",
      th: "ภาษีมูลค่าเพิ่มที่จ่ายให้ผู้ขายเมื่อซื้อ นำมาเครดิตหักจากภาษีขายได้เมื่อมีใบกำกับภาษีเต็มรูป",
    },
  },
  "tax-invoice": {
    term: { en: "Tax invoice", th: "ใบกำกับภาษี" },
    definition: {
      en: "The document that entitles you to claim input VAT — a payment slip is not enough.",
      th: "เอกสารที่ให้สิทธิ์ขอเครดิตภาษีซื้อ สลิปโอนเงินใช้แทนไม่ได้",
    },
  },
  rd: {
    term: { en: "Revenue Department (RD)", th: "กรมสรรพากร" },
    definition: {
      en: "Thailand's tax authority, which receives all VAT and withholding filings.",
      th: "หน่วยงานภาษีของไทย ผู้รับแบบภาษีมูลค่าเพิ่มและภาษีหัก ณ ที่จ่ายทั้งหมด",
    },
  },
  "buddhist-era": {
    term: { en: "Buddhist Era (พ.ศ.)", th: "พุทธศักราช (พ.ศ.)" },
    definition: {
      en: "Thai calendar year = Gregorian year + 543; used on all Revenue Department forms.",
      th: "ปีแบบไทย เท่ากับปีคริสต์ศักราชบวก 543 ใช้ในแบบของกรมสรรพากรทุกฉบับ",
    },
  },
  "nil-filing": {
    term: { en: "Nil filing", th: "การยื่นแบบเปล่า" },
    definition: {
      en: "A VAT-registered business must file PP 30 every month, even when there was no VAT activity at all.",
      th: "ผู้ประกอบการจดทะเบียนภาษีมูลค่าเพิ่มต้องยื่น ภ.พ.30 ทุกเดือน แม้เดือนนั้นไม่มีรายการซื้อขายเลย",
    },
  },
  "period-locking": {
    term: { en: "Period locking", th: "การล็อกงวดบัญชี" },
    definition: {
      en: "Once a period is filed and closed, its documents can no longer be edited; corrections go into the current period or an amended return.",
      th: "เมื่อยื่นแบบและปิดงวดแล้ว เอกสารในงวดนั้นจะแก้ไขไม่ได้อีก หากพบข้อผิดพลาดให้แก้ในงวดปัจจุบันหรือยื่นแบบเพิ่มเติม",
    },
  },
  reconciliation: {
    term: { en: "Reconciliation", th: "การกระทบยอดธนาคาร" },
    definition: {
      en: "Matching each bank transaction to the document or payment that explains it, so the books agree with the bank.",
      th: "การจับคู่รายการธนาคารแต่ละรายการกับเอกสารหรือการชำระเงินที่เกี่ยวข้อง เพื่อให้บัญชีตรงกับธนาคาร",
    },
  },
  "ai-review": {
    term: { en: "AI Review", th: "AI Review" },
    definition: {
      en: "The queue of AI-suggested matches awaiting a human decision. AI suggests; a person approves or rejects — nothing is booked automatically.",
      th: "คิวของคู่ที่ AI เสนอซึ่งรอให้คนตัดสิน AI มีหน้าที่เสนอเท่านั้น คนเป็นผู้อนุมัติหรือปฏิเสธ ระบบไม่บันทึกให้เองโดยอัตโนมัติ",
    },
  },
  sso: {
    term: { en: "Social Security (SSO)", th: "ประกันสังคม (สปส.)" },
    definition: {
      en: "Monthly employer and employee contributions of 5% each on a wage base capped at ฿15,000, due by the 15th of the following month.",
      th: "เงินสมทบรายเดือนฝ่ายนายจ้างและลูกจ้างฝ่ายละ 5% จากฐานค่าจ้างไม่เกิน 15,000 บาท นำส่งภายในวันที่ 15 ของเดือนถัดไป",
    },
  },
  depreciation: {
    term: { en: "Depreciation", th: "ค่าเสื่อมราคา" },
    definition: {
      en: "Spreading an asset's cost over its useful life instead of expensing it at once; Thai law caps the annual rate by asset type.",
      th: "การทยอยตัดราคาทุนของสินทรัพย์ตามอายุการใช้งานแทนการลงค่าใช้จ่ายทั้งก้อน กฎหมายไทยกำหนดเพดานอัตราต่อปีตามประเภทสินทรัพย์",
    },
  },
  "e-wht": {
    term: { en: "e-WHT", th: "e-WHT (หักภาษีอิเล็กทรอนิกส์)" },
    definition: {
      en: "Electronic withholding through participating banks, with a reduced rate (often 1% instead of 3%) for eligible payments.",
      th: "การหักและนำส่งภาษี ณ ที่จ่ายผ่านธนาคารที่ร่วมโครงการ ได้อัตราลดพิเศษ (เช่น 1% แทน 3%) สำหรับรายการที่เข้าเกณฑ์",
    },
  },
  "e-filing": {
    term: { en: "e-Filing", th: "การยื่นแบบออนไลน์" },
    definition: {
      en: "Filing returns through the Revenue Department's online system, which extends most monthly deadlines by about eight days.",
      th: "การยื่นแบบผ่านระบบออนไลน์ของกรมสรรพากร ซึ่งขยายกำหนดยื่นรายเดือนส่วนใหญ่ออกไปราวแปดวัน",
    },
  },
};
