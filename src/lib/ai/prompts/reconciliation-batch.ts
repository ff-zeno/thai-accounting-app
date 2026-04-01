/**
 * Prompt builder for AI reconciliation batch matching.
 * Formats transactions and documents with compact index-based IDs (T1, D1)
 * so the LLM never has to reproduce UUIDs.
 */

interface TransactionInput {
  id: string;
  date: string;
  amount: string;
  type: "debit" | "credit";
  description: string | null;
  counterparty: string | null;
  referenceNo: string | null;
  bankAccountId: string;
}

interface DocumentInput {
  id: string;
  documentNumber: string | null;
  issueDate: string | null;
  totalAmount: string | null;
  currency: string | null;
  vendorName: string | null;
  netAmountPaid: string | null;
  whtAmountWithheld: string | null;
  vatAmount: string | null;
}

export interface ReconciliationPromptResult {
  system: string;
  user: string;
  transactionIndexToId: Map<number, string>;
  documentIndexToId: Map<number, string>;
}

function truncate(value: string | null | undefined, maxLen: number): string {
  if (!value) return "";
  return value.length > maxLen ? value.slice(0, maxLen) + "..." : value;
}

function formatTransaction(index: number, txn: TransactionInput): string {
  const direction = txn.type === "debit" ? "DEBIT" : "CREDIT";
  const desc = truncate(txn.description, 200);
  const bank = txn.bankAccountId;
  return `T${index} | ${txn.date} | ${direction} ${txn.amount} | "${desc}" | ${bank}`;
}

function formatDocument(index: number, doc: DocumentInput): string {
  const vendor = truncate(doc.vendorName, 100);
  const parts = [
    `D${index}`,
    doc.documentNumber ?? "N/A",
    `Vendor: ${vendor || "Unknown"}`,
    `Total: ${doc.totalAmount ?? "N/A"}`,
    `VAT: ${doc.vatAmount ?? "0.00"}`,
    `WHT: ${doc.whtAmountWithheld ?? "0.00"}`,
    `Net: ${doc.netAmountPaid ?? doc.totalAmount ?? "N/A"}`,
    `Date: ${doc.issueDate ?? "N/A"}`,
  ];
  return parts.join(" | ");
}

const SYSTEM_PROMPT = `You are a Thai accounting reconciliation assistant. Your job is to match bank transactions to accounting documents (invoices, receipts).

RULES:
- Match based on amount, date proximity, vendor/counterparty name similarity, and reference numbers.
- Thai bank descriptions often contain abbreviated vendor names or transfer codes.
- A DEBIT transaction typically matches an expense document payment; a CREDIT matches income.
- WHT (withholding tax) means the net bank amount = document total - WHT amount. Account for this.
- Each transaction should match at most ONE document. Each document should match at most ONE transaction.
- Only suggest matches you are reasonably confident about (confidence > 0.3).
- For "strong" matches (auto-approvable), confidence should be >= 0.85.
- For "likely" matches, confidence should be 0.5-0.84.
- For "possible" matches, confidence should be 0.3-0.49.
- If a transaction cannot be matched, include it in the unmatchable list with a reason.
- Dates within 7 days of each other are acceptable. Within 2 days is a strong signal.
- Amounts must be close. Exact match is a strong signal. Differences up to 3% may be acceptable if other signals align.

OUTPUT FORMAT:
Return a JSON object with "matches" and "unmatchable" arrays as specified in the schema.`;

export function buildReconciliationPrompt(
  transactions: TransactionInput[],
  documents: DocumentInput[],
): ReconciliationPromptResult {
  const transactionIndexToId = new Map<number, string>();
  const documentIndexToId = new Map<number, string>();

  // Build transaction lines (1-indexed)
  const txnLines: string[] = [];
  for (let i = 0; i < transactions.length; i++) {
    const index = i + 1;
    transactionIndexToId.set(index, transactions[i].id);
    txnLines.push(formatTransaction(index, transactions[i]));
  }

  // Build document lines (1-indexed)
  const docLines: string[] = [];
  for (let i = 0; i < documents.length; i++) {
    const index = i + 1;
    documentIndexToId.set(index, documents[i].id);
    docLines.push(formatDocument(index, documents[i]));
  }

  const user = [
    "=== BANK TRANSACTIONS ===",
    txnLines.join("\n"),
    "",
    "=== ACCOUNTING DOCUMENTS ===",
    docLines.join("\n"),
    "",
    "=== TASK ===",
    `Match the ${transactions.length} transactions above to the ${documents.length} documents. Return your recommendations as JSON.`,
  ].join("\n");

  return {
    system: SYSTEM_PROMPT,
    user,
    transactionIndexToId,
    documentIndexToId,
  };
}
