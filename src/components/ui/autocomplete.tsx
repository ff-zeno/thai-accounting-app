"use client";

import * as React from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export interface AutocompleteOption {
  /** Canonical value stored on save. */
  value: string;
  /** Text displayed in the input / dropdown. */
  label: string;
  /** Extra keywords matched by the filter. */
  keywords?: string[];
}

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  options: AutocompleteOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Single-select autocomplete with typeahead filtering.
 *
 * Wraps base-ui Combobox. Accepts free-form input — values not in `options`
 * are passed through as-is, so legacy category strings typed by users still
 * save correctly.
 */
export function Autocomplete({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
}: AutocompleteProps) {
  const matchedLabel = React.useMemo(
    () => options.find((o) => o.value === value)?.label ?? value ?? "",
    [value, options]
  );
  const [inputValue, setInputValue] = React.useState(matchedLabel);

  // Sync when external value changes (form reset, server autofill).
  React.useEffect(() => {
    setInputValue(matchedLabel);
  }, [matchedLabel]);

  // Filter: case-insensitive match on label, value, or keywords.
  const filtered = React.useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q || q === matchedLabel.toLowerCase()) return options;
    return options.filter((o) => {
      if (o.label.toLowerCase().includes(q)) return true;
      if (o.value.toLowerCase().includes(q)) return true;
      return o.keywords?.some((k) => k.toLowerCase().includes(q));
    });
  }, [inputValue, options, matchedLabel]);

  return (
    <Combobox.Root
      items={filtered}
      itemToStringLabel={(o) => (o as AutocompleteOption).label}
      itemToStringValue={(o) => (o as AutocompleteOption).value}
      onValueChange={(v) => {
        const selected = v as AutocompleteOption | null;
        if (selected) {
          onChange(selected.value);
          setInputValue(selected.label);
        }
      }}
    >
      <div
        className={cn(
          "relative flex h-8 w-full items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <Combobox.Input
          placeholder={placeholder}
          disabled={disabled}
          value={inputValue}
          onChange={(e) => {
            const v = e.target.value;
            setInputValue(v);
            onChange(v);
          }}
          className="h-full flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Combobox.Trigger
          disabled={disabled}
          className="flex size-8 items-center justify-center text-muted-foreground"
        >
          <ChevronDown className="size-4" />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner
          className="z-50"
          sideOffset={4}
          align="start"
        >
          <Combobox.Popup className="max-h-64 w-(--anchor-width) min-w-64 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
            <Combobox.List>
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No matches
                </div>
              ) : (
                filtered.map((opt) => (
                  <Combobox.Item
                    key={opt.value}
                    value={opt}
                    className="relative flex cursor-default select-none items-center gap-2 py-1.5 pr-8 pl-2.5 text-sm outline-hidden data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span className="flex-1 truncate">{opt.label}</span>
                    <Combobox.ItemIndicator className="absolute right-2 flex items-center">
                      <Check className="size-4" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                ))
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
