"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TemplatePicker } from "./template-picker";
import { RuleList } from "./rule-list";
import { RuleEditDialog } from "./rule-edit-dialog";
import type { RuleCondition, RuleAction } from "@/lib/db/queries/reconciliation-rules";

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
  existingTemplateIds: string[];
  existingRuleCounts: Record<string, number>;
}

export function RulesPageClient({ rules, existingTemplateIds, existingRuleCounts }: Props) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingRule, setEditingRule] = useState<{
    id?: string;
    name: string;
    description: string;
    priority: number;
    conditions: RuleCondition[];
    actions: RuleAction[];
  } | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const hasRules = rules.length > 0;

  return (
    <div className="space-y-6">
      {/* Onboarding prompt when no rules exist */}
      {!hasRules && (
        <Card>
          <CardHeader>
            <CardTitle>Set up your business type</CardTitle>
            <CardDescription>
              Select an industry template to get started with pre-configured reconciliation rules
              for common Thai business transactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TemplatePicker
              existingTemplateIds={existingTemplateIds}
              existingRuleCounts={existingRuleCounts}
            />
          </CardContent>
        </Card>
      )}

      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Reconciliation Rules</h2>
        <div className="flex gap-2">
          {hasRules && (
            <Button variant="outline" onClick={() => setShowTemplates(!showTemplates)}>
              Import Template
            </Button>
          )}
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 size-4" />
            Create Rule
          </Button>
        </div>
      </div>

      {/* Template picker (when toggled on for existing orgs) */}
      {hasRules && showTemplates && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Template</CardTitle>
          </CardHeader>
          <CardContent>
            <TemplatePicker
              existingTemplateIds={existingTemplateIds}
              existingRuleCounts={existingRuleCounts}
            />
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      <RuleList
        rules={rules}
        onEdit={(rule) =>
          setEditingRule({
            id: rule.id,
            name: rule.name,
            description: rule.description ?? "",
            priority: rule.priority,
            conditions: rule.conditions as RuleCondition[],
            actions: rule.actions as RuleAction[],
          })
        }
      />

      {/* Create dialog */}
      <RuleEditDialog
        open={showCreate}
        onOpenChange={setShowCreate}
      />

      {/* Edit dialog */}
      {editingRule && (
        <RuleEditDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingRule(null);
          }}
          initialRule={editingRule}
        />
      )}
    </div>
  );
}
