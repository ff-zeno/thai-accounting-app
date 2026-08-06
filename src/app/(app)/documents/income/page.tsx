import { redirect } from "next/navigation";
import { documentListRoute } from "@/lib/routes/documents";

/** Documents split into Income and Expenses on 2026-08-05; old deep links live. */
export default function IncomeRedirectPage() {
  redirect(documentListRoute("income"));
}
