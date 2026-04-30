/**
 * Phase 8 Dogfood — delta report Tier 0 vs Tier 1.
 *
 * Reuses score.ts for both tiers (same normalizer, same weighting), then
 * reports overall / per-vendor / per-field accuracy delta and flags any
 * regressions (fields Tier 0 got right but Tier 1 got wrong).
 *
 * Usage:
 *   pnpm tsx benchmarks/dogfood/compare.ts <outDir>
 *
 * Expects:
 *   <outDir>/ground-truth.json
 *   <outDir>/<docId>.json          (Tier 0, produced by run-tier0.ts)
 *   <outDir>/tier1/<docId>.json    (Tier 1, produced by run-tier1.ts)
 *
 * Output:
 *   <outDir>/tier0-report.{json,md}   (regenerated for the docs Tier 1 covered)
 *   <outDir>/tier1-report.{json,md}
 *   <outDir>/delta-report.md
 *   <outDir>/delta-report.json
 */

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  score,
  renderReportMd,
  type ScoreReport,
  type FieldResult,
} from "./score";

interface DeltaRow {
  key: string;
  tier0Pct: number;
  tier1Pct: number;
  deltaPct: number;
  tier0Matched: number;
  tier1Matched: number;
  total: number;
}

interface Regression {
  docId: string;
  fieldName: string;
  tier0: string;
  tier1: string;
  truth: string;
}

interface Improvement {
  docId: string;
  fieldName: string;
  tier0: string;
  tier1: string;
  truth: string;
}

// ---------------------------------------------------------------------------
// Restrict a score report to a subset of docs (so Tier 0 + Tier 1 reports
// cover the same doc set when computing a meaningful delta)
// ---------------------------------------------------------------------------

function filterReport(report: ScoreReport, docIds: Set<string>): ScoreReport {
  const rows = report.rows.filter((r) => docIds.has(r.docId));
  const perDoc = report.perDoc.filter((d) => docIds.has(d.docId));

  const fieldMap = new Map<string, { matched: number; checked: number; criticality: FieldResult["criticality"] }>();
  const vendorMap = new Map<string, { docs: Set<string>; matched: number; checked: number; weightSum: number; weightMatched: number }>();

  let fieldsChecked = 0;
  let fieldsMatched = 0;
  let weightSum = 0;
  let weightMatched = 0;

  for (const r of rows) {
    fieldsChecked++;
    weightSum += r.weight;
    if (r.match) {
      fieldsMatched++;
      weightMatched += r.weight;
    }
    const f = fieldMap.get(r.fieldName) ?? {
      matched: 0,
      checked: 0,
      criticality: r.criticality,
    };
    f.checked++;
    if (r.match) f.matched++;
    fieldMap.set(r.fieldName, f);

    const v = vendorMap.get(r.vendorGroup) ?? {
      docs: new Set(),
      matched: 0,
      checked: 0,
      weightSum: 0,
      weightMatched: 0,
    };
    v.docs.add(r.docId);
    v.checked++;
    v.weightSum += r.weight;
    if (r.match) {
      v.matched++;
      v.weightMatched += r.weight;
    }
    vendorMap.set(r.vendorGroup, v);
  }

  const perField = Array.from(fieldMap.entries()).map(([fieldName, f]) => ({
    fieldName,
    criticality: f.criticality,
    checked: f.checked,
    matched: f.matched,
    accuracyPct: f.checked > 0 ? (f.matched / f.checked) * 100 : 0,
  }));
  const perVendor = Array.from(vendorMap.entries()).map(([vendorGroup, v]) => ({
    vendorGroup,
    docs: v.docs.size,
    fieldsChecked: v.checked,
    fieldsMatched: v.matched,
    weightSum: v.weightSum,
    weightMatched: v.weightMatched,
    accuracyPct: v.checked > 0 ? (v.matched / v.checked) * 100 : 0,
    weightedPct: v.weightSum > 0 ? (v.weightMatched / v.weightSum) * 100 : 0,
  }));

  return {
    ...report,
    docCount: perDoc.length,
    fieldsChecked,
    fieldsMatched,
    weightSum,
    weightMatched,
    overallAccuracyPct: fieldsChecked > 0 ? (fieldsMatched / fieldsChecked) * 100 : 0,
    overallWeightedPct: weightSum > 0 ? (weightMatched / weightSum) * 100 : 0,
    perDoc,
    perVendor,
    perField,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Find which docs Tier 1 covers
// ---------------------------------------------------------------------------

function findTier1Docs(outDir: string): string[] {
  const dir = join(outDir, "tier1");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "tier1-summary.json")
    .map((f) => f.replace(/\.json$/, ""));
}

// ---------------------------------------------------------------------------
// Markdown renderer for the delta
// ---------------------------------------------------------------------------

function deltaArrow(d: number): string {
  if (Math.abs(d) < 0.1) return "→";
  return d > 0 ? "↑" : "↓";
}

function renderDeltaMd(
  overall0: ScoreReport,
  overall1: ScoreReport,
  vendorRows: DeltaRow[],
  fieldRows: DeltaRow[],
  regressions: Regression[],
  improvements: Improvement[]
): string {
  const lines: string[] = [];
  lines.push(`# Dogfood delta — Tier 0 vs Tier 1`);
  lines.push("");
  lines.push(`**Run:** \`${overall0.runId}\`  `);
  lines.push(`**Generated:** ${new Date().toISOString()}  `);
  lines.push(
    `**Docs compared:** ${overall1.docCount} (matched against the ${overall1.docCount}-doc Tier 1 subset)  `
  );
  lines.push("");

  const rawDelta = overall1.overallAccuracyPct - overall0.overallAccuracyPct;
  const weightedDelta =
    overall1.overallWeightedPct - overall0.overallWeightedPct;

  lines.push(`## Overall accuracy`);
  lines.push("");
  lines.push(
    `- Raw:      **${overall0.overallAccuracyPct.toFixed(1)}% → ${overall1.overallAccuracyPct.toFixed(1)}%** ${deltaArrow(rawDelta)} ${rawDelta >= 0 ? "+" : ""}${rawDelta.toFixed(1)}pp`
  );
  lines.push(
    `- Weighted: **${overall0.overallWeightedPct.toFixed(1)}% → ${overall1.overallWeightedPct.toFixed(1)}%** ${deltaArrow(weightedDelta)} ${weightedDelta >= 0 ? "+" : ""}${weightedDelta.toFixed(1)}pp`
  );
  lines.push("");

  lines.push(`## Per-vendor`);
  lines.push("");
  lines.push("| Vendor | Tier 0 | Tier 1 | Δ |");
  lines.push("|--------|-------:|-------:|--:|");
  for (const r of vendorRows) {
    lines.push(
      `| ${r.key} | ${r.tier0Pct.toFixed(1)}% | ${r.tier1Pct.toFixed(1)}% | ${r.deltaPct >= 0 ? "+" : ""}${r.deltaPct.toFixed(1)}pp ${deltaArrow(r.deltaPct)} |`
    );
  }
  lines.push("");

  lines.push(`## Per-field`);
  lines.push("");
  lines.push("| Field | Tier 0 | Tier 1 | Δ | Matched 0 / 1 / Total |");
  lines.push("|-------|-------:|-------:|--:|------------------------|");
  for (const r of fieldRows) {
    lines.push(
      `| ${r.key} | ${r.tier0Pct.toFixed(1)}% | ${r.tier1Pct.toFixed(1)}% | ${r.deltaPct >= 0 ? "+" : ""}${r.deltaPct.toFixed(1)}pp ${deltaArrow(r.deltaPct)} | ${r.tier0Matched} / ${r.tier1Matched} / ${r.total} |`
    );
  }
  lines.push("");

  lines.push(`## Regressions (Tier 1 wrong, Tier 0 right)`);
  lines.push("");
  if (regressions.length === 0) {
    lines.push("_None._");
  } else {
    lines.push("| Doc | Field | Tier 0 | Tier 1 | Truth |");
    lines.push("|-----|-------|--------|--------|-------|");
    for (const r of regressions) {
      lines.push(
        `| ${r.docId} | ${r.fieldName} | \`${truncate(r.tier0)}\` | \`${truncate(r.tier1)}\` | \`${truncate(r.truth)}\` |`
      );
    }
  }
  lines.push("");

  lines.push(`## Improvements (Tier 1 right, Tier 0 wrong)`);
  lines.push("");
  if (improvements.length === 0) {
    lines.push("_None._");
  } else {
    lines.push("| Doc | Field | Tier 0 | Tier 1 | Truth |");
    lines.push("|-----|-------|--------|--------|-------|");
    for (const r of improvements) {
      lines.push(
        `| ${r.docId} | ${r.fieldName} | \`${truncate(r.tier0)}\` | \`${truncate(r.tier1)}\` | \`${truncate(r.truth)}\` |`
      );
    }
  }
  lines.push("");

  lines.push(`---`);
  lines.push("");
  lines.push(
    `> Note on subjectivity: ground-truth reflects user corrections on the source invoices, not objective truth. `
    + `A "regression" may indicate a noisy seed exemplar, not a model failure. Cross-check specific regressions before drawing conclusions.`
  );
  lines.push("");
  return lines.join("\n");
}

function truncate(s: string): string {
  const clean = s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  if (clean.length <= 60) return clean;
  return clean.slice(0, 57) + "...";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: pnpm tsx benchmarks/dogfood/compare.ts <outDir>");
    process.exit(1);
  }

  const tier1Docs = findTier1Docs(outDir);
  if (tier1Docs.length === 0) {
    console.error(
      `No Tier 1 outputs found under ${outDir}/tier1/. Run run-tier1.ts first.`
    );
    process.exit(1);
  }
  const subset = new Set(tier1Docs);
  console.log(`Comparing ${tier1Docs.length} doc(s) between Tier 0 and Tier 1.`);

  const tier0Full = score({ outDir, label: "tier0", source: "tier0" });
  const tier1Full = score({ outDir, label: "tier1", source: "tier1" });

  // Write Tier 1 report independently
  writeFileSync(
    join(outDir, "tier1-report.json"),
    JSON.stringify(tier1Full, null, 2)
  );
  writeFileSync(join(outDir, "tier1-report.md"), renderReportMd(tier1Full));

  // Restrict both reports to the Tier 1 doc subset so apples-to-apples
  const t0 = filterReport(tier0Full, subset);
  const t1 = filterReport(tier1Full, subset);

  // Vendor delta rows
  const vendorMap = new Map<string, { t0: typeof t0.perVendor[number]; t1?: typeof t1.perVendor[number] }>();
  for (const v of t0.perVendor) vendorMap.set(v.vendorGroup, { t0: v });
  for (const v of t1.perVendor) {
    const entry = vendorMap.get(v.vendorGroup);
    if (entry) entry.t1 = v;
    else vendorMap.set(v.vendorGroup, { t0: { ...v, fieldsMatched: 0, accuracyPct: 0, weightMatched: 0, weightedPct: 0 }, t1: v });
  }
  const vendorRows: DeltaRow[] = Array.from(vendorMap.entries())
    .map(([vendorGroup, p]) => {
      const t0pct = p.t0?.accuracyPct ?? 0;
      const t1pct = p.t1?.accuracyPct ?? 0;
      const t0m = p.t0?.fieldsMatched ?? 0;
      const t1m = p.t1?.fieldsMatched ?? 0;
      const total = p.t0?.fieldsChecked ?? p.t1?.fieldsChecked ?? 0;
      return {
        key: vendorGroup,
        tier0Pct: t0pct,
        tier1Pct: t1pct,
        deltaPct: t1pct - t0pct,
        tier0Matched: t0m,
        tier1Matched: t1m,
        total,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  // Field delta rows
  const fieldMap = new Map<string, { t0: typeof t0.perField[number]; t1?: typeof t1.perField[number] }>();
  for (const f of t0.perField) fieldMap.set(f.fieldName, { t0: f });
  for (const f of t1.perField) {
    const entry = fieldMap.get(f.fieldName);
    if (entry) entry.t1 = f;
    else
      fieldMap.set(f.fieldName, {
        t0: { fieldName: f.fieldName, criticality: f.criticality, checked: f.checked, matched: 0, accuracyPct: 0 },
        t1: f,
      });
  }
  const fieldRows: DeltaRow[] = Array.from(fieldMap.entries())
    .map(([fieldName, p]) => {
      const t0pct = p.t0?.accuracyPct ?? 0;
      const t1pct = p.t1?.accuracyPct ?? 0;
      return {
        key: fieldName,
        tier0Pct: t0pct,
        tier1Pct: t1pct,
        deltaPct: t1pct - t0pct,
        tier0Matched: p.t0?.matched ?? 0,
        tier1Matched: p.t1?.matched ?? 0,
        total: p.t0?.checked ?? p.t1?.checked ?? 0,
      };
    })
    .sort((a, b) => b.deltaPct - a.deltaPct);

  // Regressions / improvements — per (doc, field) row
  const rowKey = (r: FieldResult) => `${r.docId}|${r.fieldName}`;
  const t0Rows = new Map(t0.rows.map((r) => [rowKey(r), r]));
  const regressions: Regression[] = [];
  const improvements: Improvement[] = [];
  for (const r1 of t1.rows) {
    const r0 = t0Rows.get(rowKey(r1));
    if (!r0) continue;
    if (r0.match && !r1.match) {
      regressions.push({
        docId: r1.docId,
        fieldName: r1.fieldName,
        tier0: r0.aiValue,
        tier1: r1.aiValue,
        truth: r1.truthValue,
      });
    } else if (!r0.match && r1.match) {
      improvements.push({
        docId: r1.docId,
        fieldName: r1.fieldName,
        tier0: r0.aiValue,
        tier1: r1.aiValue,
        truth: r1.truthValue,
      });
    }
  }

  const md = renderDeltaMd(t0, t1, vendorRows, fieldRows, regressions, improvements);
  writeFileSync(join(outDir, "delta-report.md"), md);
  writeFileSync(
    join(outDir, "delta-report.json"),
    JSON.stringify(
      {
        runId: t0.runId,
        generatedAt: new Date().toISOString(),
        docsCompared: subset.size,
        tier0: {
          overallAccuracyPct: t0.overallAccuracyPct,
          overallWeightedPct: t0.overallWeightedPct,
        },
        tier1: {
          overallAccuracyPct: t1.overallAccuracyPct,
          overallWeightedPct: t1.overallWeightedPct,
        },
        deltaRawPct: t1.overallAccuracyPct - t0.overallAccuracyPct,
        deltaWeightedPct: t1.overallWeightedPct - t0.overallWeightedPct,
        perVendor: vendorRows,
        perField: fieldRows,
        regressions,
        improvements,
      },
      null,
      2
    )
  );

  console.log("");
  console.log(
    `Raw:      ${t0.overallAccuracyPct.toFixed(1)}% → ${t1.overallAccuracyPct.toFixed(1)}% (Δ ${(t1.overallAccuracyPct - t0.overallAccuracyPct).toFixed(1)}pp)`
  );
  console.log(
    `Weighted: ${t0.overallWeightedPct.toFixed(1)}% → ${t1.overallWeightedPct.toFixed(1)}% (Δ ${(t1.overallWeightedPct - t0.overallWeightedPct).toFixed(1)}pp)`
  );
  console.log(`Regressions:  ${regressions.length}`);
  console.log(`Improvements: ${improvements.length}`);
  console.log("");
  console.log(`Wrote ${join(outDir, "delta-report.md")}`);
}

main();
