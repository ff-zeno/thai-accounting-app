import { PageHeader } from "@/components/ui/page-header";
import { SmartUploadForm } from "./smart-upload-form";

export default function UploadStatementPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Upload Statement"
        description="Drop a PDF or CSV bank statement. We auto-detect the bank and match your account."
      />
      <SmartUploadForm />
    </div>
  );
}
