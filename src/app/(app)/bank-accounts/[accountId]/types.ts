export interface Transaction {
  id: string;
  date: string;
  description: string | null;
  amount: string;
  type: string;
  runningBalance: string | null;
  referenceNo: string | null;
  counterparty: string | null;
  reconciliationStatus: string | null;
  isPettyCash: boolean | null;
  vendorName: string | null;
  linkedDocCount: number;
  firstLinkedDocId: string | null;
  linkedDocs: string; // JSON array of {docId, docNumber, vendorName}
}

export interface Statement {
  id: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: string | null;
  closingBalance: string | null;
  parserUsed: string | null;
  importStatus: string | null;
  createdAt: Date;
  txnCount: number;
}
