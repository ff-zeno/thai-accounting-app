/**
 * Pre-extraction vendor identity probe.
 *
 * Runs cheap regex over PDF text layer to find Thai tax IDs BEFORE the
 * AI extraction runs. If a tax ID is found and matched to a known vendor,
 * we can inject exemplars into the extraction prompt (Tier 1+).
 *
 * If the probe fails (no text layer, no tax ID, or ambiguous), we return
 * null and fall back to Tier 0 (standard extraction with no exemplars).
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors, organizations } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Tax ID extraction from text
// ---------------------------------------------------------------------------

/**
 * Match 13-digit Thai tax IDs with optional dashes/spaces.
 * Examples: "0105560199507", "010-5-53712127-1", "0 105 560199507"
 */
const TAX_ID_REGEX = /(?<!\d)(\d[\s-]?){12}\d(?!\d)/g;

/** Vendor-positive keywords (200-char window before match). */
const VENDOR_KEYWORDS = [
  "co.,ltd", "co., ltd", "co.ltd", "co ltd", "company limited", "limited",
  "บริษัท", "จำกัด", "จํากัด", "payment", "express", "pte", "inc.",
  "corporation",
];

/** Customer-negative keywords (200-char window before match). */
const CUSTOMER_KEYWORDS = [
  "bill to", "billed to", "customer", "client name", "ship to",
  "ชื่อลูกค้า", "ลูกค้า", "ผู้ซื้อ",
];

/** Noise keywords that produce false-positive 13-digit sequences. */
const NOISE_KEYWORDS = [
  "bank account", "a/c", "account number", "เลขที่บัญชี",
];

interface ScoredCandidate {
  raw: string;
  normalized: string;
  position: number;
  score: number;
}

function normalizeTaxId(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

function scoreCandidate(text: string, matchStart: number): number {
  const windowStart = Math.max(0, matchStart - 200);
  const windowEnd = Math.min(text.length, matchStart + 40);
  const ctx = text.slice(windowStart, windowEnd).toLowerCase();

  let score = 0;
  for (const kw of VENDOR_KEYWORDS) if (ctx.includes(kw)) score += 2;
  for (const kw of CUSTOMER_KEYWORDS) if (ctx.includes(kw)) score -= 3;
  for (const kw of NOISE_KEYWORDS) if (ctx.includes(kw)) score -= 2;
  return score;
}

/**
 * Extract all tax ID candidates from text with confidence scores.
 * Returns candidates sorted by score (highest first), then position.
 */
export function extractTaxIdCandidates(text: string): ScoredCandidate[] {
  const results: ScoredCandidate[] = [];
  const seen = new Set<string>();

  const re = new RegExp(TAX_ID_REGEX.source, "g");
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
      score: scoreCandidate(text, m.index),
    });
  }

  results.sort((a, b) => b.score - a.score || a.position - b.position);
  return results;
}

// ---------------------------------------------------------------------------
// Probe result
// ---------------------------------------------------------------------------

export interface ProbeResult {
  vendorId: string | null;
  taxIdFound: string | null;
  /** Whether the probe confidently identified the vendor vs just guessing. */
  confident: boolean;
}

/**
 * Probe PDF text for a vendor tax ID and resolve to an existing vendor.
 *
 * Returns the vendor ID if found in the DB, or null if the probe fails
 * (no text, no 13-digit match, ambiguous top candidates, or no matching vendor).
 *
 * Conservative: requires the top candidate to beat the runner-up by ≥3 points
 * to avoid mis-identifying the wrong entity's tax ID.
 */
export async function probeVendorIdentity(
  orgId: string,
  pageTexts: string[]
): Promise<ProbeResult> {
  const fullText = pageTexts.join("\n\n");
  if (fullText.trim().length === 0) {
    return { vendorId: null, taxIdFound: null, confident: false };
  }

  const rawCandidates = extractTaxIdCandidates(fullText);
  if (rawCandidates.length === 0) {
    return { vendorId: null, taxIdFound: null, confident: false };
  }

  // Exclude the user's own org tax ID: it's always printed on invoices as
  // the buyer, never as the vendor. Without this, the buyer scores the same
  // as the vendor and the confidence check rejects every Thai invoice.
  const [org] = await db
    .select({ taxId: organizations.taxId })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .limit(1);
  const ownTaxId = org?.taxId ?? null;

  const candidates = ownTaxId
    ? rawCandidates.filter((c) => c.normalized !== ownTaxId)
    : rawCandidates;
  if (candidates.length === 0) {
    return { vendorId: null, taxIdFound: null, confident: false };
  }

  const top = candidates[0];
  const runnerUp = candidates[1];

  // DB-match priority: if any candidate resolves to a known vendor, trust
  // that over the margin heuristic. A tax ID matching a vendor row we
  // created from a prior doc is much stronger evidence than text-score.
  // Try top first, then runner-up (in case the top is a noise match).
  const topCandidates = candidates.slice(0, 3);
  for (const cand of topCandidates) {
    const [vendor] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.orgId, orgId),
          eq(vendors.taxId, cand.normalized),
          isNull(vendors.deletedAt)
        )
      )
      .limit(1);
    if (vendor) {
      return {
        vendorId: vendor.id,
        taxIdFound: cand.normalized,
        confident: true,
      };
    }
  }

  // No candidate matched a known vendor. Fall back to margin heuristic.
  const confident = !runnerUp || (top.score - runnerUp.score >= 3);

  if (!confident) {
    console.log(
      `[probe-identity] not confident — top=${top.normalized}(score=${top.score}) vs runnerUp=${runnerUp?.normalized}(score=${runnerUp?.score ?? "n/a"}); ownTaxId=${ownTaxId ?? "none"}; no DB match for any top-3 candidate`
    );
    return {
      vendorId: null,
      taxIdFound: top.normalized,
      confident: false,
    };
  }

  // Top candidate confident but no vendor in DB yet (first encounter).
  return {
    vendorId: null,
    taxIdFound: top.normalized,
    confident: true,
  };
}
