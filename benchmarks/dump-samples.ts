import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rasterizePdf } from "../src/lib/pdf/rasterize";

const REPO = process.cwd();
const OUT = join(REPO, "benchmarks", "_ground-truth-pages");
mkdirSync(OUT, { recursive: true });

const PDFS = [
  { id: "ksher", path: "_sample_file_types/Ksher/W011-01-05436.pdf" },
  {
    id: "fedex",
    path: "_sample_file_types/Paid already with Debit Device/Fedex/TH_VATINV_3552969_04022026_1308.pdf",
  },
  {
    id: "tiktok",
    path: "_sample_file_types/TikTok - just to record real investment/THTT202601830303-LUMERA(THAILAND) CO.,LTD-Invoice.pdf",
  },
];

async function main() {
  for (const p of PDFS) {
    const bytes = new Uint8Array(readFileSync(join(REPO, p.path)));
    const pages = await rasterizePdf(bytes, { scale: 2 });
    console.log(`${p.id}: ${pages.length} page(s)`);
    for (const page of pages) {
      const fp = join(OUT, `${p.id}-p${page.pageNumber}.png`);
      writeFileSync(fp, page.bytes);
      console.log(`  → ${fp} (${page.bytes.byteLength} bytes)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
