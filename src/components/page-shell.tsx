import { Badge } from "@/components/ui/badge";

interface PageShellProps {
  title: string;
  phase: string;
}

export function PageShell({ title, phase }: PageShellProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Badge variant="secondary">{phase}</Badge>
    </div>
  );
}
