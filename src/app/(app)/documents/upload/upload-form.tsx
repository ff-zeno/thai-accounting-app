"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Upload, X, FileImage, Loader2, Camera, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { uploadDocument } from "./actions";

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/pdf": [".pdf"],
};

export function UploadForm() {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    setFiles((prev) => [...prev, ...accepted]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 10 * 1024 * 1024,
  });

  const handleCameraCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const captured = e.target.files;
      if (captured && captured.length > 0) {
        setFiles((prev) => [...prev, ...Array.from(captured)]);
      }
      if (cameraRef.current) cameraRef.current.value = "";
    },
    []
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.set("direction", direction);
      files.forEach((file) => formData.append("files", file));

      const result = await uploadDocument(formData);

      if (result.success) {
        toast.success("Document uploaded successfully");
        setFiles([]);
        router.push(
          `/documents/${direction === "expense" ? "expenses" : "income"}`
        );
      } else {
        toast.error(result.error ?? "Upload failed");
      }
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Direction selector */}
      <div>
        <label className="mb-2 block text-sm font-medium">
          {t("direction")}
        </label>
        <div className="flex gap-3">
          <Button
            type="button"
            variant={direction === "expense" ? "default" : "outline"}
            onClick={() => setDirection("expense")}
            className="cursor-pointer"
          >
            {t("expense")}
          </Button>
          <Button
            type="button"
            variant={direction === "income" ? "default" : "outline"}
            onClick={() => setDirection("income")}
            className="cursor-pointer"
          >
            {t("income")}
          </Button>
        </div>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mb-4 size-10 text-muted-foreground" />
        <p className="text-center text-sm text-muted-foreground">
          {t("dragDrop")}
        </p>
        <p className="mt-1 text-center text-xs text-muted-foreground/70">
          {t("supportedFormats")}
        </p>
      </div>

      {/* Camera capture button (visible on all devices, uses camera on mobile) */}
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
        {files.length === 0 ? (
          <>
            <Camera className="mr-2 size-4" />
            Take a Photo
          </>
        ) : (
          <>
            <Plus className="mr-2 size-4" />
            Add Another Page
          </>
        )}
      </Button>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <FileImage className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate text-sm">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(i)}
                className="size-6 cursor-pointer p-0"
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={files.length === 0 || isUploading}
        className="w-full cursor-pointer"
      >
        {isUploading ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t("processing")}
          </>
        ) : (
          <>
            <Upload className="mr-2 size-4" />
            {files.length === 0
              ? "Select files to upload"
              : `${tc("upload")} (${files.length} file${files.length !== 1 ? "s" : ""})`}
          </>
        )}
      </Button>
    </div>
  );
}
