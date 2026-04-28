import { pdf } from "pdf-to-img";

export interface RasterizedPage {
  bytes: Uint8Array;
  contentType: "image/png";
  pageNumber: number;
}

export interface RasterizeOptions {
  scale?: number;
  maxPages?: number;
}

// Converts a PDF buffer to a sequence of PNG page images using pdfjs under
// the hood (no system deps). AI vision models can't reliably accept inline
// PDFs through OpenRouter, but they all accept images — so we rasterize
// server-side and send each page as `type: "image"`.
export async function rasterizePdf(
  data: Uint8Array | Buffer,
  options: RasterizeOptions = {}
): Promise<RasterizedPage[]> {
  const scale = options.scale ?? 2;
  const maxPages = options.maxPages ?? 20;

  const doc = await pdf(Buffer.from(data), { scale });
  const pages: RasterizedPage[] = [];
  let pageNumber = 0;
  for await (const pageBuffer of doc) {
    pageNumber++;
    pages.push({
      bytes: new Uint8Array(pageBuffer),
      contentType: "image/png",
      pageNumber,
    });
    if (pageNumber >= maxPages) break;
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Text-layer extraction (for vendor identity probe)
// ---------------------------------------------------------------------------

/**
 * Extract the text layer from a PDF buffer using pdfjs-dist.
 * Returns an array of strings, one per page.
 *
 * This runs pdfjs independently of the rasterizer (which uses pdf-to-img).
 * It's cheap (no image rendering) and used for the pre-extraction vendor
 * identity probe in the learning loop pipeline.
 */
export async function extractPdfText(
  data: Uint8Array | Buffer,
  options?: { maxPages?: number }
): Promise<string[]> {
  const maxPages = options?.maxPages ?? 20;

  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Register the worker as a side-effect module so pdf.js runs it inline
  // on the Node server. Without this, pdf.js tries to spawn a worker from
  // a bundled chunk path that Next.js doesn't expose.
  // @ts-expect-error — worker module has no .d.ts; imported for its side effects.
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  // pdf.js rejects Node `Buffer` even though it subclasses `Uint8Array`.
  // Wrap in a fresh Uint8Array view to strip the Buffer brand.
  const uint8Data =
    data instanceof Uint8Array && !Buffer.isBuffer(data)
      ? data
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Data,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;

  const pageTexts: string[] = [];
  const numPages = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .filter((item: Record<string, unknown>) => "str" in item)
      .map((item: Record<string, unknown>) => item.str as string)
      .join(" ");
    pageTexts.push(text);
  }

  await doc.destroy();
  return pageTexts;
}
