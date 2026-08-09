"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Back to X" for focused sub-pages (upload, import) that deliberately sit
 * outside their section's tab strip. When the visitor navigated here from
 * inside the app the link walks real browser history, so search text,
 * filters, and scroll position on the list they left survive the round
 * trip; a deep link or fresh tab falls back to the static `href`.
 */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className={cn(
        // min-h-11 = the 44px touch-target floor from DESIGN.md.
        "inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
