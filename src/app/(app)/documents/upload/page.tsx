import { redirect } from "next/navigation";
import { documentUploadRoute } from "@/lib/routes/documents";

/**
 * Documents split into Income and Expenses on 2026-08-05. The old surface was
 * direction-neutral with a `?direction=` hint; the direction is now the route,
 * so the hint becomes the redirect target. Bare `/documents/upload` (the
 * dashboard's old quick action) lands on the expense side, which is where it
 * defaulted before.
 */
export default async function UploadRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string }>;
}) {
  const { direction } = await searchParams;
  redirect(documentUploadRoute(direction === "income" ? "income" : "expense"));
}
