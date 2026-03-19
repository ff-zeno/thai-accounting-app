"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Plus, Loader2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { uploadDocument } from "../documents/upload/actions";

interface CaptureFormProps {
  initialDirection?: "expense" | "income";
}

export function CaptureForm({ initialDirection = "expense" }: CaptureFormProps) {
  const t = useTranslations("capture");
  const tc = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [captures, setCaptures] = useState<File[]>([]);
  const [direction, setDirection] = useState<"expense" | "income">(initialDirection);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        setCaptures((prev) => [...prev, ...Array.from(files)]);
      }
      // Reset input so same file can be captured again
      if (inputRef.current) inputRef.current.value = "";
    },
    []
  );

  const removeCapture = (index: number) => {
    setCaptures((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (captures.length === 0) return;
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("direction", direction);
      captures.forEach((file) => formData.append("files", file));

      const result = await uploadDocument(formData);

      if (result.success) {
        toast.success("Document submitted for processing");
        setCaptures([]);
        setSubmitted(true);
        // Auto-dismiss the "submitted" state after 3 seconds so user can capture next
        setTimeout(() => setSubmitted(false), 3000);
      } else {
        toast.error(result.error ?? "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <h1 className="text-center text-xl font-semibold">{t("title")}</h1>

      {/* Direction */}
      <div className="flex gap-2">
        <Button
          variant={direction === "expense" ? "default" : "outline"}
          onClick={() => setDirection("expense")}
          className="flex-1"
          size="sm"
        >
          Expense
        </Button>
        <Button
          variant={direction === "income" ? "default" : "outline"}
          onClick={() => setDirection("income")}
          className="flex-1"
          size="sm"
        >
          Income
        </Button>
      </div>

      {/* Camera input (hidden) */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

      {/* Previews */}
      {captures.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {captures.map((file, i) => (
            <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(file)}
                alt={`Page ${i + 1}`}
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeCapture(i)}
                className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white"
              >
                <X className="size-3" />
              </button>
              <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Capture buttons */}
      <div className="flex gap-3">
        <Button
          onClick={() => inputRef.current?.click()}
          variant="outline"
          className="flex-1"
        >
          {captures.length === 0 ? (
            <>
              <Camera className="mr-2 size-4" />
              {t("takePhoto")}
            </>
          ) : (
            <>
              <Plus className="mr-2 size-4" />
              {t("addPage")}
            </>
          )}
        </Button>
      </div>

      {/* Submit */}
      {captures.length > 0 && (
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          size="lg"
          className="w-full"
        >
          {submitting ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : null}
          {tc("done")} ({captures.length})
        </Button>
      )}

      {/* Submitted feedback */}
      {submitted && captures.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <Check className="size-4 shrink-0" />
          <span>Received, processing... Capture next document when ready.</span>
        </div>
      )}
    </div>
  );
}
