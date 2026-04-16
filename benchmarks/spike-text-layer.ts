import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Day 0 spike: validate pdfjs text-layer extraction can pull Thai/English tax IDs
// from real sample PDFs. Gate for Phase 8 Phase 1.
//
// GREEN: ≥2 of 3 PDFs hit correct tax ID. Probe viable.
// YELLOW: 1 of 3. Refine probe before Day 1.
// RED: 0 of 3. Redesign required.

interface Sample {
  id: string;
  path: string;
  expectedTaxId: string;
}

const SAMPLES: Sample[] = [
  {
    id: "ksher",
    path: "_sample_file_types/Ksher/W011-01-05436.pdf",
    expectedTaxId: "0105560199507",
  },
  {
    id: "fedex",
    path: "_sample_file_types/Paid already with Debit Device/Fedex/TH_VATINV_3552969_04022026_1308.pdf",
    expectedTaxId: "0105537121271",
  },
  {
    id: "tiktok",
    path: "_sample_file_types/TikTok - just to record real investment/THTT202601830303-LUMERA(THAILAND) CO.,LTD-Invoice.pdf",
    expectedTaxId: "0993000455738",
  },
];

// Match 13-digit Thai tax ID with optional dashes/spaces between digits.
// Examples handled: "0105560199507", "010-5-53712127-1", "0 105 560199507"
const TAX_ID_REGEX_GLOBAL = /(?<![\d\-])(\d[\s\-]?){12}\d(?![\d\-])/g;

function normalizeTaxId(raw: string): string {
  return raw.replace(/[\s\-]/g, "");
}

// Keyword proximity scoring: vendor indicators (+), customer indicators (-).
// Window = 200 chars before each match.
const VENDOR_KEYWORDS = [
  "co.,ltd", "co., ltd", "co.ltd", "co ltd", "company limited", "limited",
  "บริษัท", "จำกัด", "จํากัด",
  "payment", "express", "pte", "inc.", "corporation",
];
const CUSTOMER_KEYWORDS = [
  "bill to", "billed to", "customer", "client name", "ship to",
  "ชื่อลูกค้า", "ลูกค้า", "ผู้ซื้อ",
];
// Penalize matches inside "Bank Account" / "A/C" regions (false positives).
const NOISE_KEYWORDS = ["bank account", "a/c", "account number", "เลขที่บัญชี"];

function scoreMatch(text: string, matchStart: number): number {
  const windowStart = Math.max(0, matchStart - 200);
  const windowEnd = Math.min(text.length, matchStart + 40);
  const ctx = text.slice(windowStart, windowEnd).toLowerCase();
  let score = 0;
  for (const kw of VENDOR_KEYWORDS) if (ctx.includes(kw)) score += 2;
  for (const kw of CUSTOMER_KEYWORDS) if (ctx.includes(kw)) score -= 3;
  for (const kw of NOISE_KEYWORDS) if (ctx.includes(kw)) score -= 2;
  return score;
}

interface ScoredTaxId {
  raw: string;
  normalized: string;
  position: number;
  score: number;
}

function extractScoredTaxIds(text: string): ScoredTaxId[] {
  const results: ScoredTaxId[] = [];
  const seen = new Set<string>();
  const re = new RegExp(TAX_ID_REGEX_GLOBAL.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const normalized = normalizeTaxId(raw);
    if (normalized.length !== 13) continue;
    const key = `${normalized}:${m.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      raw,
      normalized,
      position: m.index,
      score: scoreMatch(text, m.index),
    });
  }
  // Sort by score desc, then position asc (earlier doc order wins ties)
  results.sort((a, b) => (b.score - a.score) || (a.position - b.position));
  return results;
}

async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      // @ts-expect-error - TextItem has `str`
      .map((item) => item.str ?? "")
      .join(" ");
    pageTexts.push(pageText);
  }
  await doc.destroy();
  return pageTexts.join("\n\n");
}

interface SampleResult {
  id: string;
  expectedTaxId: string;
  textLength: number;
  textSample: string;
  candidates: ScoredTaxId[];
  topPick: ScoredTaxId | null;
  correct: boolean;
}

async function runSample(sample: Sample): Promise<SampleResult> {
  const absPath = join(process.cwd(), sample.path);
  const bytes = new Uint8Array(readFileSync(absPath));
  const text = await extractTextFromPdf(bytes);

  const candidates = extractScoredTaxIds(text);
  const topPick = candidates[0] ?? null;
  const correct = topPick?.normalized === sample.expectedTaxId;

  return {
    id: sample.id,
    expectedTaxId: sample.expectedTaxId,
    textLength: text.length,
    textSample: text.slice(0, 800),
    candidates,
    topPick,
    correct,
  };
}

async function main() {
  const outDir = join(process.cwd(), "benchmarks", "output");
  mkdirSync(outDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const logPath = join(outDir, `spike-text-layer-${date}.log`);

  const lines: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    lines.push(msg);
  };

  log(`# Phase 8 Day 0 Spike — pdfjs text-layer extraction`);
  log(`# Date: ${date}`);
  log(`# Samples: ${SAMPLES.length}`);
  log("");

  const results: SampleResult[] = [];
  for (const sample of SAMPLES) {
    log(`---`);
    log(`## ${sample.id}`);
    log(`Path: ${sample.path}`);
    log(`Expected tax ID: ${sample.expectedTaxId}`);
    try {
      const r = await runSample(sample);
      results.push(r);
      log(`Text length: ${r.textLength} chars`);
      log(`Text sample (first 800):`);
      log(r.textSample);
      log("");
      log(`Scored candidates (top 5):`);
      for (const c of r.candidates.slice(0, 5)) {
        const mark = c.normalized === sample.expectedTaxId ? "★" : " ";
        log(`  ${mark} score=${c.score}  pos=${c.position}  raw=${c.raw}  norm=${c.normalized}`);
      }
      log(`Top pick: ${r.topPick?.normalized ?? "null"} (expected ${sample.expectedTaxId})`);
      log(`Sample verdict: ${r.correct ? "HIT" : "MISS"}`);
    } catch (e) {
      log(`ERROR: ${(e as Error).message}`);
      results.push({
        id: sample.id,
        expectedTaxId: sample.expectedTaxId,
        textLength: 0,
        textSample: "",
        candidates: [],
        topPick: null,
        correct: false,
      });
    }
    log("");
  }

  const hits = results.filter((r) => r.correct).length;
  const total = results.length;
  let verdict: "GREEN" | "YELLOW" | "RED";
  if (hits >= 2) verdict = "GREEN";
  else if (hits === 1) verdict = "YELLOW";
  else verdict = "RED";

  log(`---`);
  log(`# Overall: ${hits}/${total} samples hit correct tax ID`);
  log(`# Verdict: ${verdict}`);
  log("");
  log(`Gate criteria:`);
  log(`  GREEN (≥2/3): probe viable, proceed to Day 1`);
  log(`  YELLOW (1/3): refine probe, then proceed`);
  log(`  RED (0/3): redesign Phase 1`);

  writeFileSync(logPath, lines.join("\n") + "\n");
  console.log(`\nLog written to: ${logPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
