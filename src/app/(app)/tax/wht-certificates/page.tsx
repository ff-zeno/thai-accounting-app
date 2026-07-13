import { redirect } from "next/navigation";

export default function WhtCertificatesRedirectPage() {
  redirect("/tax/withholding/outgoing");
}
