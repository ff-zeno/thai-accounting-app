"use client";

import { useTransition } from "react";
import { ArrowUp, ArrowDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RuleCondition, RuleAction } from "@/lib/db/queries/reconciliation-rules";
import { toggleRuleActiveAction, deleteRuleAction, reorderRuleAction } from "./actions";

interface Rule {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  isActive: boolean;
  isAutoSuggested: boolean;
  conditions: unknown;
  actions: unknown;
  matchCount: number;
  lastMatchedAt: Date | null;
  templateId: string | null;
}

interface Props {
  rules: Rule[];
  onEdit: (rule: Rule) => void;
}

function ConditionPill({ condition }: { condition: RuleCondition }) {
  const valueStr = Array.isArray(condition.value)
    ? `${condition.value[0]}–${condition.value[1]}`
    : String(condition.value);

  return (
    <Badge variant="outline" className="text-xs font-normal">
      {condition.field} {condition.operator} &quot;{valueStr}&quot;
    </Badge>
  );
}

function ActionPill({ action }: { action: RuleAction }) {
  return (
    <Badge variant="secondary" className="text-xs font-normal">
      {action.type}: {action.value}
    </Badge>
  );
}

export function RuleList({ rules, onEdit }: Props) {
  const [isPending, startTransition] = useTransition();

  const activeRules = rules.filter((r) => r.isActive || !r.isAutoSuggested);
  const suggestedRules = rules.filter((r) => r.isAutoSuggested && !r.isActive);

  function handleToggle(ruleId: string, isActive: boolean) {
    startTransition(async () => {
      await toggleRuleActiveAction(ruleId, isActive);
    });
  }

  function handleDelete(ruleId: string) {
    startTransition(async () => {
      await deleteRuleAction(ruleId);
    });
  }

  function handleReorder(ruleId: string, direction: "up" | "down") {
    startTransition(async () => {
      await reorderRuleAction(ruleId, direction);
    });
  }

  return (
    <div className="space-y-6">
      {activeRules.length === 0 && suggestedRules.length === 0 && (
        <p className="text-sm text-muted-foreground">No rules configured yet.</p>
      )}

      {/* Active / standard rules */}
      <div className="space-y-3">
        {activeRules.map((rule, idx) => {
          const conditions = (rule.conditions as RuleCondition[]) ?? [];
          const actions = (rule.actions as RuleAction[]) ?? [];

          return (
            <Card key={rule.id} className={isPending ? "opacity-60" : ""}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold">{rule.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">
                      P{rule.priority}
                    </Badge>
                    {rule.isAutoSuggested && (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                        Auto-suggested
                      </Badge>
                    )}
                    {rule.templateId && (
                      <Badge variant="outline" className="text-xs">
                        Template
                      </Badge>
                    )}
                  </div>
                  {rule.description && (
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={(checked) => handleToggle(rule.id, checked)}
                  />
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={idx === 0}
                      onClick={() => handleReorder(rule.id, "up")}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={idx === activeRules.length - 1}
                      onClick={() => handleReorder(rule.id, "down")}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" className="size-7" />}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(rule)}>
                        <Pencil className="mr-2 size-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="mr-2 size-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {conditions.map((c, i) => (
                    <ConditionPill key={i} condition={c} />
                  ))}
                  {actions.map((a, i) => (
                    <ActionPill key={i} action={a} />
                  ))}
                </div>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span className="tabular-nums">{rule.matchCount} matches</span>
                  <span>
                    Last: {rule.lastMatchedAt
                      ? new Date(rule.lastMatchedAt).toLocaleDateString()
                      : "Never"}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Auto-suggested rules section */}
      {suggestedRules.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Suggested Rules
          </h3>
          <p className="text-xs text-muted-foreground">
            Rules suggested based on your transaction patterns
          </p>
          {suggestedRules.map((rule) => {
            const conditions = (rule.conditions as RuleCondition[]) ?? [];
            const actions = (rule.actions as RuleAction[]) ?? [];

            return (
              <Card key={rule.id} className="border-dashed">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-medium">{rule.name}</CardTitle>
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                        Auto-suggested
                      </Badge>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-muted-foreground">{rule.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleToggle(rule.id, true)}
                    disabled={isPending}
                  >
                    Activate
                  </Button>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1.5">
                    {conditions.map((c, i) => (
                      <ConditionPill key={i} condition={c} />
                    ))}
                    {actions.map((a, i) => (
                      <ActionPill key={i} action={a} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
