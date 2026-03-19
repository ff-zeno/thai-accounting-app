#!/usr/bin/env tsx
/**
 * CLI test script for the KBank PDF parser.
 *
 * Usage:
 *   pnpm test:pdf "sample LUMERA statement.pdf"
 *   pnpm test:pdf path/to/statement.pdf
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { parseKBankPdf } from "../src/lib/parsers/kbank-pdf-parser";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: pnpm test:pdf <path-to-pdf>");
  process.exit(1);
}

const fullPath = resolve(filePath);

console.log(`\n  Parsing: ${fullPath}\n`);

const data = readFileSync(fullPath);

parseKBankPdf(new Uint8Array(data))
  .then(({ result, meta, thaiDescriptions }) => {
    // ── Metadata ──
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  STATEMENT METADATA");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  Bank:           ${meta.bankCode}`);
    console.log(`  Account:        ${meta.accountNumber}`);
    console.log(`  Account Name:   ${meta.accountName}`);
    console.log(`  Branch:         ${meta.branch}`);
    console.log(`  Period:         ${meta.period.start} → ${meta.period.end}`);
    console.log();

    // ── Summary ──
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  SUMMARY");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(
      `  Deposits:       ${meta.totals.depositCount} txns   ฿${fmtNum(meta.totals.depositAmount)}`
    );
    console.log(
      `  Withdrawals:    ${meta.totals.withdrawalCount} txns   ฿${fmtNum(meta.totals.withdrawalAmount)}`
    );
    console.log(`  Opening Bal:    ฿${fmtNum(result.openingBalance ?? "0")}`);
    console.log(`  Closing Bal:    ฿${fmtNum(result.closingBalance ?? "0")}`);
    console.log(`  Total txns:     ${result.transactions.length}`);

    // Balance check
    const opening = parseFloat(result.openingBalance ?? "0");
    let running = opening;
    for (const txn of result.transactions) {
      const amt = parseFloat(txn.amount);
      running += txn.type === "credit" ? amt : -amt;
    }
    const closing = parseFloat(result.closingBalance ?? "0");
    const balanceOk = Math.abs(running - closing) < 0.01;
    console.log(
      `  Balance Check:  ${balanceOk ? "✓ PASS" : `✗ FAIL (calculated ${running.toFixed(2)}, expected ${closing.toFixed(2)})`}`
    );
    console.log();

    // ── Transactions ──
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  TRANSACTIONS");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(
      pad("#", 4) +
        pad("Date", 12) +
        pad("Type", 6) +
        padR("Amount", 14) +
        padR("Balance", 14) +
        pad("Thai Type", 28) +
        "English Description"
    );
    console.log("─".repeat(120));

    result.transactions.forEach((txn, i) => {
      const thai = thaiDescriptions[txn.externalRef];
      const sign = txn.type === "credit" ? "+" : "-";
      console.log(
        pad(String(i + 1), 4) +
          pad(txn.date, 12) +
          pad(txn.type === "credit" ? "IN" : "OUT", 6) +
          padR(`${sign}${fmtNum(txn.amount)}`, 14) +
          padR(fmtNum(txn.runningBalance ?? ""), 14) +
          pad(thai?.type ?? "", 28) +
          (txn.description ?? "").substring(0, 60)
      );
    });

    console.log("─".repeat(120));

    // ── Errors ──
    if (result.errors.length > 0) {
      console.log();
      console.log("⚠ Parse Errors:");
      result.errors.forEach((e) => console.log(`  • ${e}`));
    }

    console.log();
  })
  .catch((err) => {
    console.error("Parse error:", err);
    process.exit(1);
  });

// ── Formatting helpers ──

function fmtNum(raw: string | number): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pad(s: string, w: number): string {
  return s.padEnd(w);
}

function padR(s: string, w: number): string {
  return s.padStart(w) + "  ";
}
