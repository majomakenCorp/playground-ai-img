"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isFieldVisible,
  type OutputFormatHintClient,
  type ProviderOptionChoiceClient,
  type ProviderOptionFieldClient,
} from "@/components/playground/Playground";

export function ProviderOptions({
  fields,
  values,
  outputFormat,
  onChange,
  disabled,
}: {
  fields: ProviderOptionFieldClient[];
  values: Record<string, string>;
  outputFormat?: OutputFormatHintClient;
  onChange: (id: string, value: string) => void;
  disabled?: boolean;
}) {
  const visible = fields.filter((f) => isFieldVisible(f, values, outputFormat));
  if (visible.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {visible.map((field) => {
        const value = values[field.id] ?? field.defaultValue;
        if (field.type === "text") {
          return (
            <div
              key={field.id}
              className="flex flex-col gap-2 sm:col-span-2"
            >
              <Label htmlFor={`opt-${field.id}`}>{field.label}</Label>
              <Input
                id={`opt-${field.id}`}
                value={value}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                disabled={disabled}
              />
            </div>
          );
        }
        const choices = resolveChoices(field, values);
        const selected = choices.find((c) => c.value === value);
        return (
          <div key={field.id} className="flex flex-col gap-2">
            <Label htmlFor={`opt-${field.id}`}>{field.label}</Label>
            <Select
              value={value}
              onValueChange={(v) => onChange(field.id, v)}
              disabled={disabled || choices.length === 0}
            >
              <SelectTrigger id={`opt-${field.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {choices.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected?.description ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {selected.description}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function resolveChoices(
  field: ProviderOptionFieldClient,
  values: Record<string, string>,
): ProviderOptionChoiceClient[] {
  if (field.dependsOn && field.choicesByValue) {
    const parentValue = values[field.dependsOn];
    return parentValue ? (field.choicesByValue[parentValue] ?? []) : [];
  }
  return field.choices ?? [];
}
