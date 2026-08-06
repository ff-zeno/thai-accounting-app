/**
 * Help content registry — bilingual (EN/TH) education content keyed by
 * route prefix. Resolved via longest-prefix match so `/tax/vat/forecast`
 * inherits the `/tax/vat` entry. Unmatched routes fall back to
 * DEFAULT_HELP_ENTRY, which explains the app's monthly loop.
 *
 * Content voice: plain language for a non-accountant business owner —
 * WHAT the page is for, WHY it matters for Thai compliance, WHAT to do.
 */

export type HelpLang = "en" | "th";

export interface Localized {
  en: string;
  th: string;
}

export type FlowId = "monthly-loop" | "vat-flow" | "wht-flow";

export interface HelpSection {
  heading: Localized;
  body: Localized;
}

export interface HelpEntry {
  title: Localized;
  sections: HelpSection[];
  /** Concept flow diagram rendered below the sections. */
  flowId?: FlowId;
  /** Keys into HELP_GLOSSARY, shown as a glossary footer. */
  terms?: string[];
}

export const DEFAULT_HELP_ENTRY: HelpEntry = {
  title: { en: "How Long Tua works", th: "ลงตัวทำงานอย่างไร" },
  sections: [
    {
      heading: { en: "The monthly loop", th: "วงจรงานรายเดือน" },
      body: {
        en: "Everything in this app serves one repeating monthly loop: capture your documents, let AI extract the details, review what it found, reconcile against your bank statement, file VAT and withholding tax, then close the month. Every page you visit is one step of that loop.",
        th: "ทุกอย่างในแอปนี้หมุนรอบวงจรงานเดียวที่ทำซ้ำทุกเดือน คือ เก็บเอกสารเข้าระบบ ให้ AI อ่านรายละเอียด ตรวจทานผลที่ได้ กระทบยอดกับรายการเดินบัญชีธนาคาร ยื่นภาษีมูลค่าเพิ่มและภาษีหัก ณ ที่จ่าย แล้วจึงปิดงวดเดือน ทุกหน้าในแอปคือขั้นตอนหนึ่งของวงจรนี้",
      },
    },
    {
      heading: { en: "AI suggests, you confirm", th: "AI เสนอ คุณเป็นคนยืนยัน" },
      body: {
        en: "AI reads documents and proposes matches, but nothing becomes a tax record until a person confirms it. Anything the AI is unsure about is flagged for your review, so mistakes are caught before they ever reach a filing.",
        th: "AI อ่านเอกสารและเสนอการจับคู่ให้ แต่จะไม่มีข้อมูลใดกลายเป็นรายการภาษีจนกว่าจะมีคนยืนยัน รายการที่ AI ไม่มั่นใจจะถูกติดธงให้คุณตรวจสอบก่อน เพื่อให้ความผิดพลาดถูกจับได้ก่อนถึงขั้นยื่นแบบ",
      },
    },
    {
      heading: { en: "Why the rhythm matters", th: "ทำไมต้องทำทุกเดือน" },
      body: {
        en: "Thai tax runs on hard monthly deadlines: withholding tax returns by the 7th and VAT by the 15th of the following month (e-filing adds about eight days). Keeping the loop current each month means deadlines arrive with the work already done.",
        th: "ภาษีไทยมีกำหนดยื่นรายเดือนที่ตายตัว คือ แบบภาษีหัก ณ ที่จ่ายภายในวันที่ 7 และภาษีมูลค่าเพิ่มภายในวันที่ 15 ของเดือนถัดไป (ยื่นออนไลน์ได้เวลาเพิ่มราว 8 วัน) ถ้าทำวงจรนี้ให้ครบทุกเดือน เมื่อถึงกำหนดยื่น งานส่วนใหญ่ก็เสร็จอยู่แล้ว",
      },
    },
  ],
  flowId: "monthly-loop",
  terms: ["pp30", "wht", "rd", "buddhist-era"],
};

/**
 * Entries keyed by route prefix. Longest matching prefix wins; matching is
 * segment-aware (`/tax/vat` matches `/tax/vat/forecast` but not `/tax/vatx`).
 */
export const HELP_CONTENT: Record<string, HelpEntry> = {
  "/dashboard": {
    title: { en: "Dashboard", th: "แดชบอร์ด" },
    sections: [
      {
        heading: { en: "What this page is for", th: "หน้านี้มีไว้ทำอะไร" },
        body: {
          en: "The dashboard is your monthly health check: money in and out, documents still waiting for review, bank transactions with no matching document, and tax filings coming due. It shows where the loop is stuck, not just totals.",
          th: "แดชบอร์ดคือหน้าตรวจสุขภาพรายเดือนของธุรกิจ แสดงเงินเข้า-ออก เอกสารที่ยังรอตรวจทาน รายการธนาคารที่ยังไม่มีเอกสารจับคู่ และแบบภาษีที่ใกล้ถึงกำหนด เพื่อบอกว่างานติดอยู่ตรงไหน ไม่ใช่แค่ตัวเลขรวม",
        },
      },
      {
        heading: { en: "Why it matters", th: "ทำไมจึงสำคัญ" },
        body: {
          en: "Every unreviewed document or unmatched transaction is a number that could be wrong on next month's VAT or withholding filing. Catching it here, early, is far cheaper than amending a return the Revenue Department already has.",
          th: "เอกสารที่ยังไม่ตรวจหรือรายการที่ยังไม่จับคู่ทุกรายการ คือตัวเลขที่อาจผิดในแบบภาษีของเดือนหน้า การเจอปัญหาตั้งแต่หน้านี้ถูกกว่าการยื่นแบบเพิ่มเติมหลังจากกรมสรรพากรได้รับแบบไปแล้วมาก",
        },
      },
      {
        heading: { en: "What to do", th: "ควรทำอะไร" },
        body: {
          en: "Work top down: clear documents flagged for review, resolve unmatched bank transactions in Reconciliation, then check the filing calendar for what is due next. A clean dashboard means the month is ready to close.",
          th: "ทำงานจากบนลงล่าง เริ่มจากเคลียร์เอกสารที่ติดธงรอตรวจ จากนั้นจัดการรายการธนาคารที่ยังไม่จับคู่ในหน้ากระทบยอด แล้วดูปฏิทินภาษีว่ามีอะไรถึงกำหนดต่อไป แดชบอร์ดที่สะอาดแปลว่าเดือนนั้นพร้อมปิดงวด",
        },
      },
    ],
    flowId: "monthly-loop",
    terms: ["reconciliation", "pp30", "wht"],
  },

  "/bank-accounts": {
    title: { en: "Bank accounts", th: "บัญชีธนาคาร" },
    sections: [
      {
        heading: { en: "What this page is for", th: "หน้านี้มีไว้ทำอะไร" },
        body: {
          en: "Register each business bank account here and import its statements (KBank CSV or PDF, or a generic CSV). Imported transactions become the reference your documents are matched against — the bank's record of what actually happened.",
          th: "ลงทะเบียนบัญชีธนาคารของธุรกิจแต่ละบัญชีไว้ที่นี่ แล้วนำเข้ารายการเดินบัญชี (ไฟล์ CSV หรือ PDF ของกสิกรไทย หรือ CSV ทั่วไป) รายการที่นำเข้าจะเป็นข้อมูลอ้างอิงสำหรับจับคู่กับเอกสารของคุณ เพราะเป็นบันทึกของธนาคารว่ามีเงินเข้าออกจริงเท่าไร",
        },
      },
      {
        heading: { en: "Why complete statements matter", th: "ทำไมต้องนำเข้าให้ครบ" },
        body: {
          en: "Reconciliation is only as good as the statements behind it. A missing month leaves documents unmatched and can hide income or double-count expenses — exactly the gaps a Revenue Department audit looks for, since audits start from money movement.",
          th: "การกระทบยอดจะแม่นแค่ไหนขึ้นอยู่กับความครบถ้วนของรายการเดินบัญชี ถ้าขาดไปเดือนหนึ่ง เอกสารจะจับคู่ไม่ได้ อาจทำให้รายได้ตกหล่นหรือค่าใช้จ่ายซ้ำซ้อน ซึ่งเป็นช่องโหว่ที่การตรวจสอบของกรมสรรพากรมองหาเป็นอันดับแรก เพราะการตรวจสอบเริ่มจากการเคลื่อนไหวของเงินเสมอ",
        },
      },
      {
        heading: { en: "What to do", th: "ควรทำอะไร" },
        body: {
          en: "Import each account's statement right after month end, before filing. Re-importing is safe — the app recognises transactions it has already seen and will not duplicate them.",
          th: "นำเข้ารายการเดินบัญชีของทุกบัญชีทันทีหลังสิ้นเดือน ก่อนยื่นภาษี การนำเข้าซ้ำไม่มีปัญหา เพราะระบบจำรายการที่เคยนำเข้าแล้วได้และจะไม่บันทึกซ้ำ",
        },
      },
    ],
    terms: ["reconciliation"],
  },

  "/income": {
    title: { en: "Income", th: "รายรับ" },
    sections: [
      {
        heading: { en: "What this page is for", th: "หน้านี้มีไว้ทำอะไร" },
        body: {
          en: "Everything on the money-in side: the invoices and receipts you issue to customers, and the settlement reports from card and marketplace processors that explain the deposits landing in your bank.",
          th: "ทุกอย่างในฝั่งเงินเข้า ทั้งใบแจ้งหนี้และใบเสร็จที่คุณออกให้ลูกค้า และรายงานการโอนเงินจากผู้ให้บริการรับชำระเงินหรือมาร์เก็ตเพลส ซึ่งอธิบายว่าเงินที่เข้าบัญชีธนาคารมาจากไหน",
        },
      },
      {
        heading: { en: "VAT is owed on the gross sale", th: "VAT คิดจากยอดขายเต็ม" },
        body: {
          en: "Output VAT is calculated on the full price the customer paid, never on the smaller amount that reaches your bank after processor fees. A ฿1,070 card sale that deposits ฿1,047 still owes VAT on ฿1,070. Under-reporting here is one of the most common assessment findings.",
          th: "ภาษีขายคำนวณจากราคาเต็มที่ลูกค้าจ่าย ไม่ใช่ยอดที่เหลือเข้าบัญชีหลังหักค่าธรรมเนียม การขายผ่านบัตร 1,070 บาทที่เงินเข้าจริง 1,047 บาท ยังต้องเสีย VAT จากฐาน 1,070 บาท การแจ้งต่ำกว่าความจริงตรงนี้เป็นประเด็นที่ถูกประเมินภาษีบ่อยที่สุดข้อหนึ่ง",
        },
      },
      {
        heading: { en: "What to do", th: "ควรทำอะไร" },
        body: {
          en: "Review income documents so the sales figures behind your PP 30 are right, and import processor settlement reports so each payout deposit stops looking like an unexplained credit on the bank statement.",
          th: "ตรวจทานเอกสารรายรับเพื่อให้ยอดขายที่ใช้ยื่น ภ.พ.30 ถูกต้อง และนำเข้ารายงานการโอนเงินจากผู้ให้บริการรับชำระเงิน เพื่อให้เงินที่เข้าบัญชีแต่ละก้อนไม่เป็นรายการที่อธิบายไม่ได้ในใบแจ้งยอดธนาคาร",
        },
      },
    ],
    flowId: "vat-flow",
    terms: ["output-vat", "tax-invoice"],
  },

  "/expenses": {
    title: { en: "Expenses", th: "รายจ่าย" },
    sections: [
      {
        heading: { en: "What this page is for", th: "หน้านี้มีไว้ทำอะไร" },
        body: {
          en: "The money-out side: every purchase invoice, receipt and payment you capture, each with a status showing where it is — uploaded, being read by AI, waiting for your review, or completed.",
          th: "ฝั่งเงินออก ทั้งใบแจ้งหนี้ค่าซื้อ ใบเสร็จ และการจ่ายเงินทุกรายการที่บันทึกเข้ามา พร้อมสถานะบอกว่าอยู่ขั้นไหน ตั้งแต่อัปโหลดแล้ว กำลังให้ AI อ่าน รอคุณตรวจทาน ไปจนถึงเสร็จสมบูรณ์",
        },
      },
      {
        heading: { en: "Why review matters", th: "ทำไมต้องตรวจทาน" },
        body: {
          en: "AI extracts the vendor, amounts, VAT and withholding from each file and scores its own confidence; fields it is unsure about wait for a person. What you confirm here flows into your input VAT claim and your withholding certificates.",
          th: "AI จะดึงชื่อผู้ขาย จำนวนเงิน ภาษีมูลค่าเพิ่ม และภาษีหัก ณ ที่จ่ายจากไฟล์ พร้อมให้คะแนนความมั่นใจของตัวเอง ช่องที่ไม่มั่นใจจะรอให้คนตรวจ ข้อมูลที่คุณยืนยันที่นี่จะไหลไปเข้าเครดิตภาษีซื้อและหนังสือรับรองหัก ณ ที่จ่าย",
        },
      },
      {
        heading: { en: "Capture the right document", th: "เก็บเอกสารให้ถูกใบ" },
        body: {
          en: "Only a full tax invoice (ใบกำกับภาษี) showing your company name and tax ID supports an input VAT claim. A payment slip or an อย่างย่อ abbreviated receipt proves money moved but claims nothing.",
          th: "เฉพาะใบกำกับภาษีแบบเต็มรูปที่มีชื่อบริษัทและเลขประจำตัวผู้เสียภาษีของคุณเท่านั้นที่ใช้ขอเครดิตภาษีซื้อได้ สลิปโอนเงินหรือใบกำกับภาษีอย่างย่อพิสูจน์ได้แค่ว่ามีการจ่ายเงิน แต่ขอเครดิตไม่ได้",
        },
      },
    ],
    terms: ["tax-invoice", "input-vat", "ai-review"],
  },

  "/documents": {
    title: { en: "Documents", th: "เอกสาร" },
    sections: [
      {
        heading: { en: "What this page is for", th: "หน้านี้มีไว้ทำอะไร" },
        body: {
          en: "Every invoice, receipt, and tax invoice you capture lives here, each with a status showing where it is in the pipeline: uploaded, being read by AI, waiting for your review, or completed.",
          th: "ใบแจ้งหนี้ ใบเสร็จ และใบกำกับภาษีทุกใบที่บันทึกเข้ามาจะอยู่ที่หน้านี้ พร้อมสถานะบอกว่าเอกสารอยู่ขั้นไหน ตั้งแต่อัปโหลดแล้ว กำลังให้ AI อ่าน รอคุณตรวจทาน ไปจนถึงเสร็จสมบูรณ์",
        },
      },
      {
        heading: { en: "Why review matters", th: "ทำไมต้องตรวจทาน" },
        body: {
          en: "AI extracts the vendor, amounts, VAT and withholding from each file, and scores its own confidence. Fields it is unsure about are flagged, and those documents wait for a person. What you confirm here flows into VAT reports and withholding certificates, so a minute of review protects the whole filing.",
          th: "AI จะดึงชื่อผู้ขาย จำนวนเงิน ภาษีมูลค่าเพิ่ม และภาษีหัก ณ ที่จ่ายจากไฟล์ พร้อมให้คะแนนความมั่นใจของตัวเอง ช่องไหนที่ไม่มั่นใจจะถูกติดธงรอให้คนตรวจ ข้อมูลที่คุณยืนยันในหน้านี้จะไหลไปเข้ารายงานภาษีมูลค่าเพิ่มและหนังสือรับรองหัก ณ ที่จ่าย การใช้เวลาตรวจหนึ่งนาทีจึงช่วยคุ้มครองทั้งแบบภาษี",
        },
      },
      {
        heading: { en: "What to do", th: "ควรทำอะไร" },
        body: {
          en: "Clear the review queue regularly and fix any misread fields. For purchases, make sure the underlying file is a real tax invoice (ใบกำกับภาษี) — that document, not a payment slip, is what entitles you to claim input VAT.",
          th: "หมั่นเคลียร์คิวเอกสารรอตรวจและแก้ช่องที่ AI อ่านผิด สำหรับรายการซื้อ ให้ตรวจว่าไฟล์ต้นทางเป็นใบกำกับภาษีตัวจริง ไม่ใช่แค่สลิปโอนเงิน เพราะใบกำกับภาษีเท่านั้นที่ให้สิทธิ์ขอเครดิตภาษีซื้อ",
        },
      },
    ],
    terms: ["tax-invoice", "input-vat", "ai-review"],
  },

  "/capture": {
    title: { en: "Capture", th: "บันทึกเอกสาร" },
    sections: [
      {
        heading: { en: "What this page is for", th: "หน้านี้มีไว้ทำอะไร" },
        body: {
          en: "The fastest way to get paper into the system: photograph or upload a document and AI does the typing. Each capture enters the same pipeline — extraction, your review, then reconciliation against your bank.",
          th: "วิธีที่เร็วที่สุดในการนำเอกสารกระดาษเข้าระบบ เพียงถ่ายรูปหรืออัปโหลด แล้ว AI จะพิมพ์ข้อมูลให้ เอกสารทุกใบเข้าสู่กระบวนการเดียวกัน คือดึงข้อมูล ให้คุณตรวจทาน แล้วนำไปกระทบยอดกับธนาคาร",
        },
      },
      {
        heading: { en: "Capture the right document", th: "ถ่ายเอกสารให้ถูกใบ" },
        body: {
          en: "For expenses with VAT, photograph the tax invoice itself, not the payment slip. Only a full tax invoice (ใบกำกับภาษี) with your company's name and tax ID supports an input VAT claim; a slip only proves that money moved.",
          th: "สำหรับรายจ่ายที่มีภาษีมูลค่าเพิ่ม ให้ถ่ายใบกำกับภาษีตัวจริง ไม่ใช่สลิปโอนเงิน เพราะเฉพาะใบกำกับภาษีแบบเต็มรูปที่มีชื่อบริษัทและเลขประจำตัวผู้เสียภาษีของคุณเท่านั้นที่ใช้ขอเครดิตภาษีซื้อได้ ส่วนสลิปพิสูจน์ได้แค่ว่ามีการโอนเงิน",
        },
      },
      {
        heading: { en: "Make it a habit", th: "ทำให้เป็นนิสัย" },
        body: {
          en: "Capture at the moment of purchase and nothing goes missing at month end. Faded thermal receipts and lost invoices are the most common reason a VAT claim has to be dropped.",
          th: "ถ่ายเอกสารทันทีตอนซื้อ แล้วจะไม่มีอะไรหายตอนสิ้นเดือน ใบเสร็จกระดาษความร้อนที่ซีดจางและใบกำกับภาษีที่หายไป คือสาเหตุอันดับต้น ๆ ที่ทำให้ต้องตัดสิทธิ์ภาษีซื้อทิ้ง",
        },
      },
    ],
    terms: ["tax-invoice", "ai-review"],
  },

  "/reconciliation": {
    title: { en: "Reconciliation", th: "กระทบยอดธนาคาร" },
    sections: [
      {
        heading: { en: "What this page is for", th: "หน้านี้มีไว้ทำอะไร" },
        body: {
          en: "Reconciliation pairs each bank transaction with the document or payment that explains it. The app tries automatic matching first (references, learned vendor aliases, exact amounts, your rules), then AI proposes matches for what is left, and anything still ambiguous comes to you.",
          th: "การกระทบยอดคือการจับคู่รายการธนาคารแต่ละรายการกับเอกสารหรือการชำระเงินที่อธิบายรายการนั้น ระบบจะจับคู่อัตโนมัติก่อน (จากเลขอ้างอิง ชื่อคู่ค้าที่เรียนรู้ไว้ ยอดเงินที่ตรงกัน และกฎที่คุณตั้ง) จากนั้น AI จะเสนอคู่ให้กับรายการที่เหลือ ส่วนรายการที่ยังกำกวมจะส่งมาให้คุณตัดสิน",
        },
      },
      {
        heading: { en: "What AI Review means", th: "AI Review คืออะไร" },
        body: {
          en: "AI Review is the queue of matches the AI has suggested but not applied. The AI never books anything on its own — you approve or reject each suggestion, and every decision teaches the system, so more matches happen automatically next month.",
          th: "AI Review คือคิวของคู่ที่ AI เสนอไว้แต่ยังไม่ถูกบันทึก AI จะไม่บันทึกอะไรเองเด็ดขาด คุณเป็นคนกดอนุมัติหรือปฏิเสธทีละรายการ และทุกการตัดสินใจจะช่วยสอนระบบ ทำให้เดือนถัดไปจับคู่อัตโนมัติได้มากขึ้น",
        },
      },
      {
        heading: { en: "Why it matters", th: "ทำไมจึงสำคัญ" },
        body: {
          en: "A fully reconciled month proves your books agree with the bank. That is the foundation for a correct VAT return and your strongest evidence in a Revenue Department audit.",
          th: "เดือนที่กระทบยอดครบถ้วนคือหลักฐานว่าบัญชีของคุณตรงกับธนาคาร ซึ่งเป็นรากฐานของแบบภาษีมูลค่าเพิ่มที่ถูกต้อง และเป็นหลักฐานที่หนักแน่นที่สุดเมื่อถูกกรมสรรพากรตรวจสอบ",
        },
      },
      {
        heading: { en: "What to do", th: "ควรทำอะไร" },
        body: {
          en: "Confirm the high-confidence matches quickly, work through the ambiguous ones, and visit AI Review to approve or reject the AI's suggestions. Aim to finish before you file the month's VAT.",
          th: "ยืนยันคู่ที่ความมั่นใจสูงอย่างรวดเร็ว ไล่จัดการรายการที่กำกวม แล้วเข้า AI Review เพื่ออนุมัติหรือปฏิเสธข้อเสนอของ AI ตั้งเป้าให้เสร็จก่อนยื่นภาษีมูลค่าเพิ่มของเดือนนั้น",
        },
      },
    ],
    flowId: "monthly-loop",
    terms: ["reconciliation", "ai-review"],
  },

  "/tax/vat": {
    title: { en: "VAT — PP 30", th: "ภาษีมูลค่าเพิ่ม — ภ.พ.30" },
    sections: [
      {
        heading: { en: "Output VAT vs input VAT", th: "ภาษีขายกับภาษีซื้อ" },
        body: {
          en: "Output VAT (ภาษีขาย) is the 7% you collect from customers on sales. Input VAT (ภาษีซื้อ) is the 7% you pay suppliers on purchases — claimable only when you hold a full tax invoice. You are effectively a tax collector: the VAT you collect was never your money.",
          th: "ภาษีขายคือภาษี 7% ที่คุณเรียกเก็บจากลูกค้าเมื่อขายสินค้าหรือบริการ ส่วนภาษีซื้อคือ 7% ที่คุณจ่ายให้ผู้ขายเมื่อซื้อ ซึ่งขอเครดิตได้ก็ต่อเมื่อมีใบกำกับภาษีแบบเต็มรูป โดยแท้จริงแล้วคุณคือคนเก็บภาษีแทนรัฐ เงินภาษีขายที่เก็บมาไม่ใช่เงินของคุณตั้งแต่แรก",
        },
      },
      {
        heading: { en: "The PP 30 offset", th: "การหักกลบใน ภ.พ.30" },
        body: {
          en: "Each month PP 30 nets the two: output VAT minus input VAT. If output is larger, you pay the difference to the Revenue Department; if input is larger, the excess carries forward as a credit against next month (or you can request a refund). PP 30 must be filed every month, even a zero month.",
          th: "ทุกเดือน ภ.พ.30 จะนำภาษีขายมาหักด้วยภาษีซื้อ ถ้าภาษีขายมากกว่า คุณจ่ายส่วนต่างให้กรมสรรพากร ถ้าภาษีซื้อมากกว่า ส่วนเกินจะยกไปเป็นเครดิตหักในเดือนถัดไป (หรือจะขอคืนก็ได้) และต้องยื่น ภ.พ.30 ทุกเดือนแม้เดือนนั้นไม่มีรายการเลย",
        },
      },
      {
        heading: { en: "PP 36 is a separate lane", th: "ภ.พ.36 แยกคนละส่วน" },
        body: {
          en: "When you pay a foreign provider (ads, software, consulting), you self-assess 7% VAT on their behalf using PP 36. It is a separate form with its own payment — it is never added to the same month's PP 30 input VAT. Only after you have actually remitted the PP 36 amount can it come back as input VAT on a later month's PP 30.",
          th: "เมื่อจ่ายค่าบริการให้ผู้ให้บริการต่างประเทศ (เช่น ค่าโฆษณา ซอฟต์แวร์ ที่ปรึกษา) คุณต้องนำส่งภาษีมูลค่าเพิ่ม 7% แทนเขาด้วยแบบ ภ.พ.36 ซึ่งเป็นแบบแยกต่างหากพร้อมการชำระของตัวเอง ห้ามนำไปรวมเป็นภาษีซื้อใน ภ.พ.30 ของเดือนเดียวกันเด็ดขาด ต่อเมื่อนำส่งเงินตาม ภ.พ.36 แล้วเท่านั้น จึงจะนำมาใช้เป็นภาษีซื้อใน ภ.พ.30 ของเดือนถัดไปได้",
        },
      },
      {
        heading: { en: "Deadlines", th: "กำหนดยื่น" },
        body: {
          en: "PP 30 is due by the 15th of the following month on paper, or the 23rd via e-filing. PP 36 is due by the 15th with no extension. This page builds the return from your confirmed documents — finish reconciliation and document review first.",
          th: "ภ.พ.30 ต้องยื่นภายในวันที่ 15 ของเดือนถัดไปหากยื่นกระดาษ หรือวันที่ 23 หากยื่นออนไลน์ ส่วน ภ.พ.36 ต้องยื่นภายในวันที่ 15 โดยไม่มีการขยายเวลา หน้านี้สร้างแบบจากเอกสารที่คุณยืนยันแล้ว จึงควรกระทบยอดและตรวจเอกสารให้เสร็จก่อน",
        },
      },
    ],
    flowId: "vat-flow",
    terms: [
      "output-vat",
      "input-vat",
      "pp30",
      "pp36",
      "tax-invoice",
      "nil-filing",
    ],
  },

  "/tax/withholding": {
    title: { en: "Withholding tax (WHT)", th: "ภาษีหัก ณ ที่จ่าย" },
    sections: [
      {
        heading: { en: "The concept", th: "หลักการ" },
        body: {
          en: "When you pay for services in Thailand, you keep back a slice of the payment — commonly 3% for services and professional fees, 5% for rent — and send it to the Revenue Department on the vendor's behalf. The vendor receives the net amount plus a certificate proving the tax was withheld.",
          th: "เมื่อจ่ายค่าบริการในประเทศไทย คุณต้องหักเงินส่วนหนึ่งไว้จากยอดจ่าย โดยทั่วไปหัก 3% สำหรับค่าบริการและค่าวิชาชีพ และ 5% สำหรับค่าเช่า แล้วนำส่งกรมสรรพากรแทนผู้รับเงิน ผู้รับเงินจะได้รับยอดสุทธิพร้อมหนังสือรับรองว่าถูกหักภาษีไว้แล้ว",
        },
      },
      {
        heading: { en: "The 50 Tawi certificate", th: "หนังสือรับรอง 50 ทวิ" },
        body: {
          en: "Every withholding must be documented with a 50 Tawi certificate issued to the payee. It is not paperwork for its own sake: the vendor uses it as a tax credit on their own return, so they will chase you for it. This page generates the certificates from your confirmed payments.",
          th: "การหักภาษีทุกครั้งต้องออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ให้ผู้รับเงิน เอกสารนี้ไม่ใช่แค่พิธี เพราะผู้รับเงินจะใช้เป็นเครดิตภาษีในแบบของเขาเอง จึงมักทวงถามแน่นอน หน้านี้สร้างหนังสือรับรองให้จากรายการจ่ายที่คุณยืนยันแล้ว",
        },
      },
      {
        heading: { en: "PND 3 and PND 53", th: "ภ.ง.ด.3 และ ภ.ง.ด.53" },
        body: {
          en: "Withholdings are reported monthly: PND 3 covers payments to individuals, PND 53 covers payments to Thai companies. Paper filing is due by the 7th of the following month; e-filing extends it to the 15th.",
          th: "ภาษีที่หักไว้ต้องนำส่งเป็นรายเดือน โดย ภ.ง.ด.3 ใช้กับการจ่ายให้บุคคลธรรมดา และ ภ.ง.ด.53 ใช้กับการจ่ายให้นิติบุคคลไทย ยื่นกระดาษภายในวันที่ 7 ของเดือนถัดไป หรือยื่นออนไลน์ได้ถึงวันที่ 15",
        },
      },
      {
        heading: { en: "Incoming vs outgoing", th: "ฝั่งถูกหักกับฝั่งหักเขา" },
        body: {
          en: "This works in both directions. When customers pay you for services, they withhold from you and must give you a 50 Tawi certificate — collect every one, because those certificates are prepaid tax you credit against your year-end income tax.",
          th: "เรื่องนี้มีสองฝั่งเสมอ เมื่อลูกค้าจ่ายค่าบริการให้คุณ เขาจะหักภาษีจากคุณและต้องออกหนังสือรับรอง 50 ทวิให้ อย่าลืมเก็บให้ครบทุกใบ เพราะนั่นคือภาษีที่จ่ายล่วงหน้าไว้แล้ว ใช้เป็นเครดิตหักภาษีเงินได้ตอนสิ้นปีได้",
        },
      },
    ],
    flowId: "wht-flow",
    terms: ["wht", "fifty-tawi", "pnd3", "pnd53", "e-wht"],
  },

  "/tax/calendar": {
    title: { en: "Filing calendar", th: "ปฏิทินภาษี" },
    sections: [
      {
        heading: { en: "What this page is for", th: "หน้านี้มีไว้ทำอะไร" },
        body: {
          en: "One view of every Revenue Department deadline for your business, month by month. Dates already account for weekends and Thai public holidays — when a deadline lands on one, it rolls to the next business day.",
          th: "หน้ารวมกำหนดยื่นภาษีกับกรมสรรพากรของธุรกิจคุณทั้งหมดในที่เดียว เรียงเป็นรายเดือน วันที่ที่แสดงคำนวณวันหยุดเสาร์อาทิตย์และวันหยุดราชการไทยให้แล้ว ถ้ากำหนดตรงกับวันหยุดจะเลื่อนไปวันทำการถัดไป",
        },
      },
      {
        heading: { en: "The monthly rhythm", th: "จังหวะรายเดือน" },
        body: {
          en: "For each month's activity, the following month goes: withholding returns (PND 1, 3, 53) by the 7th; VAT PP 30 and PP 36 by the 15th. Filing electronically through the RD's e-filing system earns an extension — WHT moves to the 15th and PP 30 to the 23rd. PP 36 gets no extension.",
          th: "สำหรับรายการของแต่ละเดือน เดือนถัดไปมีกำหนดดังนี้ แบบภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1, 3, 53) ภายในวันที่ 7 และภาษีมูลค่าเพิ่ม ภ.พ.30 กับ ภ.พ.36 ภายในวันที่ 15 หากยื่นผ่านระบบ e-Filing ของกรมสรรพากรจะได้ขยายเวลา โดยภาษีหัก ณ ที่จ่ายเลื่อนเป็นวันที่ 15 และ ภ.พ.30 เลื่อนเป็นวันที่ 23 ส่วน ภ.พ.36 ไม่มีการขยายเวลา",
        },
      },
      {
        heading: {
          en: "Why deadlines are unforgiving",
          th: "พลาดกำหนดแล้วเกิดอะไร",
        },
        body: {
          en: "Late filings carry a fixed fine per form plus a surcharge of 1.5% per month on any unpaid tax — and a pattern of lateness invites closer inspection. Note that RD forms show years in Buddhist Era (พ.ศ. = ค.ศ. + 543).",
          th: "การยื่นช้ามีค่าปรับคงที่ต่อแบบ บวกเงินเพิ่มร้อยละ 1.5 ต่อเดือนของภาษีที่ค้างชำระ และถ้ายื่นช้าบ่อย ๆ ก็เสี่ยงถูกจับตามากขึ้น อนึ่ง แบบของกรมสรรพากรใช้ปีพุทธศักราช (พ.ศ. = ค.ศ. + 543)",
        },
      },
    ],
    terms: ["rd", "e-filing", "buddhist-era", "nil-filing"],
  },
};

/** Strips trailing slashes so `/dashboard/` matches `/dashboard`. */
function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Resolves the help entry for a pathname via longest-prefix match.
 * Matching is segment-aware: a prefix matches only the exact path or a
 * deeper segment (`/tax/vat` matches `/tax/vat/forecast`, not `/tax/vatx`).
 * Falls back to DEFAULT_HELP_ENTRY when nothing matches.
 */
export function resolveHelpEntry(pathname: string): HelpEntry {
  const path = normalizePath(pathname);
  let best: HelpEntry | undefined;
  let bestLength = -1;
  for (const [prefix, entry] of Object.entries(HELP_CONTENT)) {
    const isMatch = path === prefix || path.startsWith(`${prefix}/`);
    if (isMatch && prefix.length > bestLength) {
      best = entry;
      bestLength = prefix.length;
    }
  }
  return best ?? DEFAULT_HELP_ENTRY;
}
