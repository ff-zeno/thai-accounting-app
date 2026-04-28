"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateAiSettingsAction } from "./actions";
import { toast } from "sonner";
import {
  type ModelPurpose,
  type ModelInfo,
  DEFAULT_MODEL_IDS,
  getModelsForPurpose,
} from "@/lib/ai/models-catalog";

// ---------------------------------------------------------------------------
// Provider icons (colored circles with initials)
// ---------------------------------------------------------------------------

const PROVIDER_COLORS: Record<string, string> = {
  Google: "bg-blue-500",
  OpenAI: "bg-emerald-600",
};

function ProviderIcon({ provider }: { provider: string }) {
  const color = PROVIDER_COLORS[provider] ?? "bg-gray-500";
  const initials = provider.slice(0, 2).toUpperCase();
  return (
    <span
      className={`inline-flex size-6 items-center justify-center rounded-md text-[10px] font-bold text-white ${color}`}
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Model picker — rich dropdown grouped by provider
// ---------------------------------------------------------------------------

interface AiSettingsFormProps {
  settings: {
    extractionModel: string | null;
    classificationModel: string | null;
    translationModel: string | null;
    monthlyBudgetUsd: string | null;
    budgetAlertThreshold: string | null;
  } | null;
}

function ModelPicker({
  purpose,
  label,
  description,
  name,
  value,
  onChange,
}: {
  purpose: ModelPurpose;
  label: string;
  description: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const models = getModelsForPurpose(purpose);
  const defaultId = DEFAULT_MODEL_IDS[purpose];
  const selected = models.find((m) => m.id === value) ?? null;

  // Group by provider
  const providers = [...new Set(models.map((m) => m.provider))];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-1.5 rounded-md border p-1.5">
          {/* Default option */}
          <button
            type="button"
            onClick={() => onChange("")}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
              !value ? "bg-accent font-medium" : ""
            }`}
          >
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
              DF
            </span>
            <div className="flex-1">
              <p className="font-medium">Default</p>
              <p className="text-xs text-muted-foreground">
                {defaultId.split("/")[1]}
              </p>
            </div>
            {!value && <span className="size-2 rounded-full bg-primary" />}
          </button>

          {providers.map((provider) => (
            <div key={provider}>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {provider}
              </p>
              {models
                .filter((m) => m.provider === provider)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onChange(m.id)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                      value === m.id ? "bg-accent font-medium" : ""
                    }`}
                  >
                    <ProviderIcon provider={m.provider} />
                    <div className="flex-1">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ${m.inputCostPer1M} in / ${m.outputCostPer1M} out per 1M
                      </p>
                    </div>
                    {value === m.id && (
                      <span className="size-2 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
            </div>
          ))}
        </div>
        <input type="hidden" name={name} value={value} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function AiSettingsForm({ settings }: AiSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [extractionModel, setExtractionModel] = useState(
    settings?.extractionModel ?? ""
  );
  const [classificationModel, setClassificationModel] = useState(
    settings?.classificationModel ?? ""
  );
  const [translationModel, setTranslationModel] = useState(
    settings?.translationModel ?? ""
  );
  const [budgetCurrency, setBudgetCurrency] = useState<"THB" | "USD">("THB");

  function handleSubmit(formData: FormData) {
    setError(null);

    // Convert THB budget to USD for storage (approximate rate)
    if (budgetCurrency === "THB") {
      const thbValue = formData.get("monthlyBudgetUsd") as string;
      if (thbValue && thbValue !== "") {
        const usdValue = (parseFloat(thbValue) / 35).toFixed(2);
        formData.set("monthlyBudgetUsd", usdValue);
      }
    }

    startTransition(async () => {
      const result = await updateAiSettingsAction(formData);
      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        toast.success("AI settings updated");
      }
    });
  }

  // Convert stored USD back to display currency
  const displayBudget =
    settings?.monthlyBudgetUsd && budgetCurrency === "THB"
      ? (parseFloat(settings.monthlyBudgetUsd) * 35).toFixed(0)
      : settings?.monthlyBudgetUsd ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Model Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-6">
          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Model pickers — two-column on desktop */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ModelPicker
              purpose="extraction"
              label="Document Extraction"
              description="Reads document images and extracts financial data"
              name="extractionModel"
              value={extractionModel}
              onChange={setExtractionModel}
            />
            <ModelPicker
              purpose="classification"
              label="Classification"
              description="Categorizes documents and detects types"
              name="classificationModel"
              value={classificationModel}
              onChange={setClassificationModel}
            />
            <ModelPicker
              purpose="translation"
              label="Translation"
              description="Translates between Thai and English"
              name="translationModel"
              value={translationModel}
              onChange={setTranslationModel}
            />
          </div>

          {/* Budget controls */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Budget Controls
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="monthlyBudgetUsd">Monthly Budget</Label>
                <div className="flex gap-2">
                  <Input
                    id="monthlyBudgetUsd"
                    name="monthlyBudgetUsd"
                    type="number"
                    min="0"
                    step={budgetCurrency === "THB" ? "1" : "0.01"}
                    placeholder="No limit"
                    defaultValue={displayBudget}
                  />
                  <Select
                    value={budgetCurrency}
                    onValueChange={(v) =>
                      setBudgetCurrency(v as "THB" | "USD")
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="THB">THB</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty for no budget limit
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budgetAlertThreshold">Alert Threshold (%)</Label>
                <Input
                  id="budgetAlertThreshold"
                  name="budgetAlertThreshold"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder="80"
                  defaultValue={
                    settings?.budgetAlertThreshold
                      ? (parseFloat(settings.budgetAlertThreshold) * 100).toString()
                      : ""
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Alert when spending reaches this % of budget
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending} className="cursor-pointer">
              {isPending ? "Saving..." : "Save AI Settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
