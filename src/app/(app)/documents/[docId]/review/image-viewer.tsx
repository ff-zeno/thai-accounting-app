"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileRecord {
  id: string;
  fileUrl: string;
  pageNumber: number | null;
  originalFilename: string | null;
}

export function ImageViewer({ files }: { files: FileRecord[] }) {
  const t = useTranslations("review");
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No images
      </div>
    );
  }

  const current = files[currentPage];

  return (
    <div className="flex h-full flex-col">
      {/* Controls */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            disabled={zoom >= 3}
          >
            <ZoomIn className="size-4" />
          </Button>
        </div>

        {files.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("page")} {currentPage + 1} {t("of")} {files.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCurrentPage((p) => Math.min(files.length - 1, p + 1))
              }
              disabled={currentPage === files.length - 1}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Image */}
      <div className="flex-1 overflow-auto bg-muted/30 p-4">
        <div
          className="mx-auto transition-transform"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.fileUrl}
            alt={current.originalFilename || `Page ${currentPage + 1}`}
            className="max-w-full rounded shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}
