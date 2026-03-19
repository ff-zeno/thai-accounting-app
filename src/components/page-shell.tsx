import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PageShellProps {
  title: string;
  phase: string;
}

export function PageShell({ title, phase }: PageShellProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Construction className="size-8 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">This feature is under development.</p>
      <Badge variant="secondary" className="text-xs">{phase}</Badge>
    </div>
  );
}
