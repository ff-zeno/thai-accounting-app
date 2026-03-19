import { CaptureForm } from "./capture-form";

interface Props {
  searchParams: Promise<{ type?: string }>;
}

export default async function CapturePage({ searchParams }: Props) {
  const params = await searchParams;
  const initialDirection =
    params.type === "income" ? "income" : "expense";

  return <CaptureForm initialDirection={initialDirection} />;
}
