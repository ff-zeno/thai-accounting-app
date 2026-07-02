import { redirect } from "next/navigation";

export default function WhtCreditsReceivedRedirectPage() {
  redirect("/tax/withholding/incoming");
}
