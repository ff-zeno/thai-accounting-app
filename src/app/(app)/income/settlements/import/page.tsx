import { PageHeader } from "@/components/ui/page-header";
import { SettlementImportForm } from "./settlement-import-form";

export default function SettlementImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import settlements"
        description="Upload a processor's settlement report and map its columns once — the mapping is remembered for next time."
      />
      <SettlementImportForm />
    </div>
  );
}
