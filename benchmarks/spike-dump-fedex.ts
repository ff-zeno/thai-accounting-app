import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const path = join(
    process.cwd(),
    "_sample_file_types/Paid already with Debit Device/Fedex/TH_VATINV_3552969_04022026_1308.pdf"
  );
  const bytes = new Uint8Array(readFileSync(path));
  // @ts-expect-error legacy entry
  const doc = await pdfjsLib.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false }).promise;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    console.log(`\n=== page ${i} (${tc.items.length} items) ===`);
    // @ts-expect-error
    const text = tc.items.map((it) => it.str).join(" | ");
    console.log(text);
  }

  // Search for every 13-digit sequence in the raw concatenated text
  const all: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // @ts-expect-error
    const text = tc.items.map((it) => it.str).join(" ");
    all.push(text);
  }
  const joined = all.join("\n");
  const matches = joined.match(/\d{13}/g) ?? [];
  console.log(`\n=== all 13-digit sequences: ${JSON.stringify(matches)} ===`);
  await doc.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
