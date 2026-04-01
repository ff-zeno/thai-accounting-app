"use client";

import { useState, useTransition } from "react";
import { Building2, UtensilsCrossed, Briefcase, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { templateRegistry } from "@/lib/reconciliation/templates";
import { applyBusinessTemplateAction } from "./actions";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "building-2": Building2,
  utensils: UtensilsCrossed,
  briefcase: Briefcase,
  "shopping-cart": ShoppingCart,
};

interface Props {
  existingTemplateIds?: string[];
  existingRuleCounts?: Record<string, number>;
}

export function TemplatePicker({ existingRuleCounts = {} }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleApply() {
    if (!selected) return;
    setError(null);
    setResult(null);

    startTransition(async () => {
      const res = await applyBusinessTemplateAction(selected);
      if ("error" in res) {
        setError(res.error);
      } else {
        setResult({ created: res.rulesCreated, skipped: res.rulesSkipped });
        setSelected(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {templateRegistry.map((tmpl) => {
          const Icon = ICONS[tmpl.icon] ?? Building2;
          const existingCount = existingRuleCounts[tmpl.id] ?? 0;
          const isSelected = selected === tmpl.id;

          return (
            <Card
              key={tmpl.id}
              className={cn(
                "cursor-pointer transition-colors",
                isSelected && "ring-2 ring-primary bg-accent",
              )}
              onClick={() => setSelected(tmpl.id)}
            >
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Icon className="size-5 text-muted-foreground" />
                <div className="flex-1">
                  <CardTitle className="text-sm font-semibold">{tmpl.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{tmpl.nameTh}</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {tmpl.rules.length} rules
                </Badge>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">{tmpl.description}</p>
                {existingCount > 0 && (
                  <p className="mt-2 text-xs text-amber-600">
                    You already have {existingCount} rules from this template.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleApply}
          disabled={!selected || isPending}
        >
          {isPending ? "Applying..." : "Apply Template"}
        </Button>
        {result && (
          <p className="text-sm text-green-600">
            {result.created} rules created, {result.skipped} skipped
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
