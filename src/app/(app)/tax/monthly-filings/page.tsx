import { redirect } from "next/navigation";

export default function MonthlyFilingsRedirectPage() {
  redirect("/tax/withholding/filings");
}
