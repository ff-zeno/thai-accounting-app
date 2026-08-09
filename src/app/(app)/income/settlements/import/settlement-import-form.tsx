"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlowStrip } from "@/components/ui/flow-strip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { TableCard } from "@/components/ui/table-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sumAmounts } from "@/lib/utils/money";
import type {
  ParsedSettlement,
  SettlementColumnMapping,
  SettlementRowError,
} from "@/lib/parsers/settlement-csv";
import {
  confirmSettlementImportAction,
  previewSettlementsAction,
  readSettlementFileAction,
} from "./actions";

/**
 * Which mapping fields exist, in the order the owner sees them. `required`
 * drives both the asterisk and the button gate — gross/fee/net and the
 * settlement ID are what the balance invariant and the unique key need.
 */
const MAPPING_FIELDS = [
  { key: "externalId", label: "Settlement ID", required: true },
  { key: "grossAmount", label: "Gross amount", required: true },
  { key: "feeAmount", label: "Fee", required: true },
  { key: "feeVatAmount", label: "VAT on fee", required: false },
  { key: "netPayout", label: "Net payout", required: true },
  { key: "periodStart", label: "Period start", required: false },
  { key: "periodEnd", label: "Period end", required: false },
] as const satisfies ReadonlyArray<{
  key: keyof SettlementColumnMapping;
  label: string;
  required: boolean;
}>;

type MappingDraft = Partial<Record<keyof SettlementColumnMapping, string>>;

/**
 * Best-effort first guess so a familiar file needs no clicks. Wrong guesses are
 * cheap — the owner sees every selection before anything is parsed, and the
 * balance check rejects a bad mapping outright rather than importing under it.
 */
function guessMapping(columns: string[]): MappingDraft {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const find = (exclude: Array<string | undefined>, ...patterns: string[]) =>
    columns.find(
      (c) => !exclude.includes(c) && patterns.some((p) => norm(c).includes(p))
    );

  // Claim the fee-VAT column first, so "Fee" does not swallow "Fee VAT" in a
  // file that lists them adjacently.
  const feeVatAmount = find([], "feevat", "vatonfee", "vat");

  return {
    externalId: find([], "settlementid", "payoutid", "batchid", "reference", "id"),
    grossAmount: find([], "gross", "sales", "total"),
    feeAmount: find([feeVatAmount], "fee", "mdr", "commission"),
    feeVatAmount,
    netPayout: find([], "net", "payout", "deposit"),
    periodStart: find([], "periodstart", "startdate", "from"),
    periodEnd: find([], "periodend", "enddate", "settlementdate", "to"),
  };
}

function isComplete(draft: MappingDraft): draft is SettlementColumnMapping {
  return MAPPING_FIELDS.every((f) => !f.required || Boolean(draft[f.key]));
}

export function SettlementImportForm() {
  const router = useRouter();

  const [processor, setProcessor] = React.useState("");
  const [csvText, setCsvText] = React.useState<string | null>(null);
  const [columns, setColumns] = React.useState<string[]>([]);
  const [mapping, setMapping] = React.useState<MappingDraft>({});
  const [preview, setPreview] = React.useState<{
    settlements: ParsedSettlement[];
    errors: SettlementRowError[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleFile(formData: FormData) {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const result = await readSettlementFileAction(formData);
      if (!result.success || !result.csvText || !result.columns) {
        setError(result.error ?? "Could not read the file");
        return;
      }
      setCsvText(result.csvText);
      setColumns(result.columns);
      setMapping(result.rememberedMapping ?? guessMapping(result.columns));
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    if (!csvText || !isComplete(mapping)) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewSettlementsAction(csvText, mapping));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!csvText || !isComplete(mapping)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmSettlementImportAction({
        processor,
        csvText,
        mapping,
      });
      if (!result.success) {
        setError(result.error ?? "Import failed");
        return;
      }
      router.push("/income/settlements");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const totals = preview
    ? {
        gross: sumAmounts(preview.settlements.map((s) => s.grossAmount)),
        fee: sumAmounts(preview.settlements.map((s) => s.feeAmount)),
        feeVat: sumAmounts(preview.settlements.map((s) => s.feeVatAmount)),
        net: sumAmounts(preview.settlements.map((s) => s.netPayout)),
      }
    : null;

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      <Card tone="income">
        <CardHeader>
          <CardTitle>1. Choose the report</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleFile} className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label htmlFor="processor">Processor</Label>
              <Input
                id="processor"
                name="processor"
                required
                placeholder="e.g. Omise, 2C2P, GrabFood"
                value={processor}
                onChange={(e) => setProcessor(e.target.value)}
                className="w-56"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="file">Settlement CSV</Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                className="w-72"
              />
            </div>
            <Button type="submit" disabled={busy || !processor.trim()}>
              Read columns
            </Button>
          </form>
        </CardContent>
      </Card>

      {columns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Map the columns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MAPPING_FIELDS.map((field) => (
                <div key={field.key} className="grid gap-2">
                  <Label htmlFor={`map-${field.key}`}>
                    {field.label}
                    {field.required && (
                      <span aria-hidden className="text-destructive">
                        {" *"}
                      </span>
                    )}
                  </Label>
                  <NativeSelect
                    id={`map-${field.key}`}
                    className="w-full"
                    value={mapping[field.key] ?? ""}
                    onChange={(e) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: e.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">
                      {field.required ? "Select a column…" : "Not in this file"}
                    </option>
                    {columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
            <Button
              onClick={handlePreview}
              disabled={busy || !isComplete(mapping)}
            >
              Check the file
            </Button>
          </CardContent>
        </Card>
      )}

      {preview && (
        <div className="space-y-4">
          {preview.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>
                {preview.errors.length} row
                {preview.errors.length === 1 ? "" : "s"} rejected
              </AlertTitle>
              <AlertDescription>
                <p>
                  A settlement whose own arithmetic does not close cannot explain
                  a bank deposit, so these rows are not imported. Fix them in the
                  file and upload again.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {preview.errors.slice(0, 10).map((rowError, index) => (
                    <li key={index}>
                      {rowError.row === 0 ? "File" : `Row ${rowError.row}`}:{" "}
                      {rowError.message}
                    </li>
                  ))}
                </ul>
                {preview.errors.length > 10 && (
                  <p className="mt-2">
                    …and {preview.errors.length - 10} more.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {preview.settlements.length === 0 ? (
            <Alert>
              <AlertTriangle />
              <AlertTitle>Nothing to import</AlertTitle>
              <AlertDescription>
                No row in this file passed validation under the current mapping.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert>
                <CheckCircle2 />
                <AlertTitle>
                  {preview.settlements.length} settlement
                  {preview.settlements.length === 1 ? "" : "s"} ready to import
                </AlertTitle>
                <AlertDescription>
                  Gross is your output-VAT base. Net is only what the bank
                  deposit should match.
                </AlertDescription>
              </Alert>

              {totals && (
                <FlowStrip
                  steps={[
                    { label: "Gross sales", value: totals.gross },
                    { label: "Processor fees", value: totals.fee, op: "minus" },
                    { label: "VAT on fees", value: totals.feeVat, op: "minus" },
                    { label: "Net to bank", value: totals.net, op: "equals" },
                  ]}
                />
              )}

              <TableCard title="3. Confirm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Settlement</TableHead>
                      <TableHead>Period end</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Fee</TableHead>
                      <TableHead className="text-right">Fee VAT</TableHead>
                      <TableHead className="text-right">Net to bank</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.settlements.slice(0, 50).map((settlement) => (
                      <TableRow key={settlement.externalId}>
                        <TableCell className="font-medium">
                          {settlement.externalId}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {settlement.periodEnd ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={settlement.grossAmount} />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          <Amount value={settlement.feeAmount} />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          <Amount value={settlement.feeVatAmount ?? "0.00"} />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <Amount value={settlement.netPayout} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>

              {preview.settlements.length > 50 && (
                <p className="text-sm text-muted-foreground">
                  Showing the first 50 of {preview.settlements.length}. All of
                  them will be imported.
                </p>
              )}

              <Button onClick={handleConfirm} disabled={busy}>
                Import {preview.settlements.length} settlement
                {preview.settlements.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
