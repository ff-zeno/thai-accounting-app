"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RuleCondition, RuleAction } from "@/lib/db/queries/reconciliation-rules";
import { createRuleAction, updateRuleAction } from "./actions";

const FIELD_OPTIONS = [
  { value: "counterparty", label: "Counterparty" },
  { value: "description", label: "Description" },
  { value: "amount", label: "Amount" },
  { value: "channel", label: "Channel" },
  { value: "bank_account", label: "Bank Account" },
  { value: "type", label: "Type" },
  { value: "reference_no", label: "Reference No" },
  { value: "day_of_month", label: "Day of Month" },
] as const;

const TEXT_OPERATORS = ["contains", "starts_with", "ends_with", "equals", "regex"] as const;
const NUMERIC_OPERATORS = ["gt", "lt", "between", "equals"] as const;

const NUMERIC_FIELDS = new Set(["amount", "day_of_month"]);

function getOperatorsForField(field: string) {
  if (NUMERIC_FIELDS.has(field)) return [...NUMERIC_OPERATORS];
  return [...TEXT_OPERATORS];
}

const ACTION_OPTIONS = [
  { value: "assign_vendor", label: "Assign Vendor" },
  { value: "assign_category", label: "Assign Category" },
  { value: "auto_match", label: "Auto Match" },
  { value: "mark_petty_cash", label: "Mark Petty Cash" },
  { value: "skip_reconciliation", label: "Skip Reconciliation" },
] as const;

interface EditingRule {
  id?: string;
  name: string;
  description: string;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRule?: EditingRule;
}

const EMPTY_CONDITION: RuleCondition = { field: "counterparty", operator: "contains", value: "" };
const EMPTY_ACTION: RuleAction = { type: "auto_match", value: "true" };

export function RuleEditDialog({ open, onOpenChange, initialRule }: Props) {
  const isEditing = !!initialRule?.id;

  const [name, setName] = useState(initialRule?.name ?? "");
  const [description, setDescription] = useState(initialRule?.description ?? "");
  const [priority, setPriority] = useState(initialRule?.priority ?? 100);
  const [conditions, setConditions] = useState<RuleCondition[]>(
    initialRule?.conditions?.length ? initialRule.conditions : [{ ...EMPTY_CONDITION }],
  );
  const [actions, setActions] = useState<RuleAction[]>(
    initialRule?.actions?.length ? initialRule.actions : [{ ...EMPTY_ACTION }],
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateCondition(idx: number, updates: Partial<RuleCondition>) {
    setConditions((prev) => prev.map((c, i) => (i === idx ? { ...c, ...updates } : c)));
  }

  function removeCondition(idx: number) {
    if (conditions.length <= 1) return;
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAction(idx: number, updates: Partial<RuleAction>) {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, ...updates } : a)));
  }

  function removeAction(idx: number) {
    if (actions.length <= 1) return;
    setActions((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    setError(null);
    const data = { name, description, priority, conditions, actions };

    startTransition(async () => {
      const res = isEditing
        ? await updateRuleAction(initialRule!.id!, data)
        : await createRuleAction(data);

      if ("error" in res) {
        setError(res.error);
      } else {
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Rule" : "Create Rule"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rule name"
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-desc">Description (optional)</Label>
            <Input
              id="rule-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this rule do?"
              maxLength={500}
            />
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-priority">Priority (lower = higher priority)</Label>
            <Input
              id="rule-priority"
              type="number"
              min={1}
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value, 10) || 1)}
            />
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <Label>Conditions</Label>
            {conditions.map((cond, idx) => {
              const operators = getOperatorsForField(cond.field);
              return (
                <div key={idx} className="flex gap-1.5 items-start">
                  <Select
                    value={cond.field}
                    onValueChange={(v) => {
                      if (!v) return;
                      const newOps = getOperatorsForField(v);
                      updateCondition(idx, {
                        field: v as RuleCondition["field"],
                        operator: newOps.includes(cond.operator as never) ? cond.operator : newOps[0] as RuleCondition["operator"],
                      });
                    }}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={cond.operator}
                    onValueChange={(v) => updateCondition(idx, { operator: v as RuleCondition["operator"] })}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operators.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {cond.operator === "between" ? (
                    <div className="flex flex-1 gap-1">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={Array.isArray(cond.value) ? cond.value[0] : ""}
                        onChange={(e) => {
                          const min = parseFloat(e.target.value) || 0;
                          const max = Array.isArray(cond.value) ? cond.value[1] : 0;
                          updateCondition(idx, { value: [min, max] });
                        }}
                      />
                      <Input
                        type="number"
                        placeholder="Max"
                        value={Array.isArray(cond.value) ? cond.value[1] : ""}
                        onChange={(e) => {
                          const min = Array.isArray(cond.value) ? cond.value[0] : 0;
                          const max = parseFloat(e.target.value) || 0;
                          updateCondition(idx, { value: [min, max] });
                        }}
                      />
                    </div>
                  ) : (
                    <Input
                      className="flex-1"
                      value={typeof cond.value === "string" ? cond.value : String(cond.value)}
                      onChange={(e) => updateCondition(idx, { value: e.target.value })}
                      placeholder="Value"
                    />
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    disabled={conditions.length <= 1}
                    onClick={() => removeCondition(idx)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConditions((prev) => [...prev, { ...EMPTY_CONDITION }])}
            >
              <Plus className="mr-1.5 size-3.5" />
              Add Condition
            </Button>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Label>Actions</Label>
            {actions.map((action, idx) => (
              <div key={idx} className="flex gap-1.5 items-start">
                <Select
                  value={action.type}
                  onValueChange={(v) => updateAction(idx, { type: v as RuleAction["type"] })}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  className="flex-1"
                  value={action.value}
                  onChange={(e) => updateAction(idx, { value: e.target.value })}
                  placeholder="Value"
                />

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  disabled={actions.length <= 1}
                  onClick={() => removeAction(idx)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActions((prev) => [...prev, { ...EMPTY_ACTION }])}
            >
              <Plus className="mr-1.5 size-3.5" />
              Add Action
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving..." : isEditing ? "Update Rule" : "Create Rule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
