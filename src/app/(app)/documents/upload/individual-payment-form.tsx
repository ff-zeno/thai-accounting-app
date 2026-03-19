"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import {
  Upload,
  X,
  FileImage,
  Loader2,
  Camera,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createIndividualPaymentAction,
  type IndividualPaymentResult,
} from "./individual-payment-action";
import { SERVICE_CATEGORIES } from "@/lib/tax/service-categories";
import { validateThaiCitizenId } from "@/lib/utils/validators";

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

interface ExtractionState {
  nameTh: string;
  nameEn?: string;
  citizenId: string;
  confidence: number;
  citizenIdValid: boolean;
}

export function IndividualPaymentForm() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [extraction, setExtraction] = useState<ExtractionState | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Form fields
  const [amount, setAmount] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [note, setNote] = useState("");

  const onDrop = useCallback((accepted: File[]) => {
    // Only keep the latest file(s) for ID card (replace, don't append)
    setFiles(accepted);
    setExtraction(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
  });

  const handleCameraCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const captured = e.target.files;
      if (captured && captured.length > 0) {
        setFiles(Array.from(captured));
        setExtraction(null);
      }
      if (cameraRef.current) cameraRef.current.value = "";
    },
    []
  );

  const removeFile = () => {
    setFiles([]);
    setExtraction(null);
  };

  // Computed values
  const selectedCategory = SERVICE_CATEGORIES.find(
    (c) => c.value === serviceCategory
  );
  const amountNum = parseFloat(amount) || 0;
  const whtRate = selectedCategory ? parseFloat(selectedCategory.rate) : 0;
  const whtAmount = amountNum * whtRate;
  const netPayment = amountNum - whtAmount;

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error("Please upload an ID card image");
      return;
    }
    if (!amount || amountNum <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!serviceCategory) {
      toast.error("Please select a service category");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.set("amount", amountNum.toFixed(2));
      formData.set("serviceCategory", serviceCategory);
      formData.set("paymentDate", paymentDate);
      if (note) formData.set("note", note);

      const result: IndividualPaymentResult =
        await createIndividualPaymentAction(formData);

      if (result.success) {
        // Show extracted data if available
        if (result.extractedData) {
          const cidValidation = validateThaiCitizenId(
            result.extractedData.citizenId
          );
          setExtraction({
            nameTh: result.extractedData.nameTh,
            nameEn: result.extractedData.nameEn,
            citizenId: result.extractedData.citizenId,
            confidence: result.extractedData.confidence,
            citizenIdValid: cidValidation.valid,
          });
        }

        toast.success("Payment document created, pending review");
        setShowSuccess(true);
      } else {
        toast.error(result.error ?? "Failed to create payment document");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAnother = () => {
    setFiles([]);
    setExtraction(null);
    setAmount("");
    setServiceCategory("");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setNote("");
    setShowSuccess(false);
  };

  if (showSuccess) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <CheckCircle2 className="size-12 text-green-500" />
          <div className="text-center">
            <p className="text-lg font-medium">Document Created</p>
            <p className="text-sm text-muted-foreground">
              Pending review before confirmation
            </p>
          </div>

          {extraction && (
            <div className="w-full max-w-sm space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-medium">
                  {extraction.nameTh}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Citizen ID
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm">
                    {extraction.citizenId}
                  </span>
                  {extraction.citizenIdValid ? (
                    <Badge variant="secondary">
                      <CheckCircle2 className="mr-0.5 size-3" />
                      Valid
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle className="mr-0.5 size-3" />
                      Invalid
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleAddAnother}
              className="cursor-pointer"
            >
              Add Another Payment
            </Button>
            <Button
              onClick={() => router.push("/documents/expenses")}
              className="cursor-pointer"
            >
              View Documents
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A: ID Card Upload */}
      <Card>
        <CardHeader>
          <CardTitle>ID Card Scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {files.length === 0 ? (
            <>
              <div
                {...getRootProps()}
                className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="mb-3 size-8 text-muted-foreground" />
                <p className="text-center text-sm text-muted-foreground">
                  Drop ID card image here, or click to browse
                </p>
                <p className="mt-1 text-center text-xs text-muted-foreground/70">
                  JPG or PNG, max 10MB
                </p>
              </div>

              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCameraCapture}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => cameraRef.current?.click()}
                className="w-full cursor-pointer"
              >
                <Camera className="mr-2 size-4" />
                Take a Photo
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                <FileImage className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">
                  {files[0].name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(files[0].size / 1024 / 1024).toFixed(1)} MB
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeFile}
                  className="size-6 cursor-pointer p-0"
                >
                  <X className="size-3" />
                </Button>
              </div>

              {extraction && (
                <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Name (Thai)
                    </span>
                    <span className="text-sm font-medium">
                      {extraction.nameTh}
                    </span>
                  </div>
                  {extraction.nameEn && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Name (English)
                      </span>
                      <span className="text-sm font-medium">
                        {extraction.nameEn}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Citizen ID
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm">
                        {extraction.citizenId}
                      </span>
                      {extraction.citizenIdValid ? (
                        <Badge variant="secondary">
                          <CheckCircle2 className="mr-0.5 size-3" />
                          Valid
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertCircle className="mr-0.5 size-3" />
                          Invalid checksum
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setExtraction(null)}
                    className="cursor-pointer"
                    disabled={isExtracting}
                  >
                    <RotateCcw className="mr-1 size-3" />
                    Re-extract
                  </Button>
                </div>
              )}

              {isExtracting && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Extracting ID card data...
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section B: Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (THB)</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Service Category */}
          <div className="space-y-2">
            <Label>Service Category</Label>
            <Select
              value={serviceCategory}
              onValueChange={(v) => setServiceCategory(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* WHT & Net calculation display */}
          {amountNum > 0 && selectedCategory && (
            <div className="space-y-2 rounded-lg bg-muted/50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Gross amount</span>
                <span className="font-medium">
                  {amountNum.toLocaleString("th-TH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  WHT: {(whtRate * 100).toFixed(0)}% (
                  {selectedCategory.section})
                </span>
                <span className="font-medium text-orange-600">
                  -
                  {whtAmount.toLocaleString("th-TH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="border-t pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Net payment</span>
                  <span className="font-semibold">
                    {"\u0E3F"}
                    {netPayment.toLocaleString("th-TH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Payment date */}
          <div className="space-y-2">
            <Label htmlFor="paymentDate">Payment Date</Label>
            <Input
              id="paymentDate"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note / Description</Label>
            <Textarea
              id="note"
              placeholder="Description of services rendered..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={
          files.length === 0 ||
          !amount ||
          amountNum <= 0 ||
          !serviceCategory ||
          isSubmitting
        }
        className="w-full cursor-pointer"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Creating document...
          </>
        ) : (
          <>
            <Upload className="mr-2 size-4" />
            Create Payment Document
          </>
        )}
      </Button>
    </div>
  );
}
