import { SmartUploadForm } from "./smart-upload-form";

export default function UploadStatementPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Upload Statement
        </h1>
        <p className="text-sm text-muted-foreground">
          Drop a PDF or CSV bank statement. We auto-detect the bank and match
          your account.
        </p>
      </div>
      <SmartUploadForm />
    </div>
  );
}
