"use client";

import { useEffect, useMemo, useState } from "react";
import { ProviderSelect } from "@/components/playground/ProviderSelect";
import { ProviderOptions } from "@/components/playground/ProviderOptions";
import { PromptForm } from "@/components/playground/PromptForm";
import { ResultPanel } from "@/components/playground/ResultPanel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ProviderOptionChoiceClient {
  value: string;
  label: string;
  description?: string;
}

export interface ProviderOptionFieldClient {
  id: string;
  label: string;
  defaultValue: string;
  type?: "select" | "text";
  placeholder?: string;
  maxLength?: number;
  choices?: ProviderOptionChoiceClient[];
  dependsOn?: string;
  choicesByValue?: Record<string, ProviderOptionChoiceClient[]>;
  defaultsByValue?: Record<string, string>;
  visibleWhenParentIn?: string[];
  hideForVectorOutput?: boolean;
}

export function isVectorOutput(
  hint: OutputFormatHintClient,
  values: Record<string, string>,
): boolean {
  for (const rule of hint.rules) {
    if (values[rule.optionId] === rule.valueIs) {
      return /svg/i.test(rule.label);
    }
  }
  return /svg/i.test(hint.defaultLabel);
}

export function isFieldVisible(
  field: ProviderOptionFieldClient,
  values: Record<string, string>,
  hint?: OutputFormatHintClient,
): boolean {
  if (field.hideForVectorOutput && hint && isVectorOutput(hint, values)) {
    return false;
  }
  if (!field.dependsOn) return true;
  const parentValue = values[field.dependsOn];
  if (field.visibleWhenParentIn) {
    return field.visibleWhenParentIn.includes(parentValue);
  }
  if (field.choicesByValue) {
    return Boolean(parentValue) && parentValue in field.choicesByValue;
  }
  return true;
}

export interface OutputFormatHintClient {
  rules: Array<{ optionId: string; valueIs: string; label: string }>;
  defaultLabel: string;
}

export interface ProviderOption {
  id: string;
  displayName: string;
  optionFields: ProviderOptionFieldClient[];
  outputFormat: OutputFormatHintClient;
}

export function describeOutput(
  hint: OutputFormatHintClient,
  values: Record<string, string>,
): string {
  for (const rule of hint.rules) {
    if (values[rule.optionId] === rule.valueIs) return rule.label;
  }
  return hint.defaultLabel;
}

export interface GenerateResult {
  id: string;
  providerId: string;
  prompt: string;
  imageUrl: string;
  mimeType: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    raw: unknown;
  };
  createdAt: string;
}

interface SystemPromptItem {
  id: string;
  title: string;
  name: string;
}

export function Playground({ providers }: { providers: ProviderOption[] }) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [optionsByProvider, setOptionsByProvider] = useState<
    Record<string, Record<string, string>>
  >(() => initialOptions(providers));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const [systemPrompts, setSystemPrompts] = useState<SystemPromptItem[]>([]);
  const [useSystemPrompt, setUseSystemPrompt] = useState(false);
  const [systemPromptId, setSystemPromptId] = useState("");

  useEffect(() => {
    fetch("/api/system-prompts")
      .then((r) => r.json())
      .then((data: { items?: SystemPromptItem[] }) => {
        setSystemPrompts(data.items ?? []);
      })
      .catch(() => {});
  }, []);

  const currentProvider = useMemo(
    () => providers.find((p) => p.id === providerId),
    [providers, providerId],
  );
  const currentOptions = optionsByProvider[providerId] ?? {};

  function setOption(id: string, value: string) {
    setOptionsByProvider((prev) => {
      const provOpts = { ...(prev[providerId] ?? {}), [id]: value };

      // When a parent field changes, reconcile any dependent fields whose
      // current value is no longer valid for the new parent value.
      const fields = currentProvider?.optionFields ?? [];
      for (const field of fields) {
        if (field.dependsOn !== id || !field.choicesByValue) continue;
        const allowed = field.choicesByValue[value] ?? [];
        const current = provOpts[field.id];
        const stillValid =
          current && allowed.some((c) => c.value === current);
        if (!stillValid) {
          provOpts[field.id] =
            field.defaultsByValue?.[value] ??
            allowed[0]?.value ??
            field.defaultValue;
        }
      }
      return { ...prev, [providerId]: provOpts };
    });
  }

  async function onSubmit(prompt: string) {
    if (!providerId) return;
    setError(null);
    setPending(true);
    try {
      // Strip options for hidden fields so the server isn't sent stale values.
      const fields = currentProvider?.optionFields ?? [];
      const hint = currentProvider?.outputFormat;
      const submittedOptions: Record<string, string> = {};
      for (const field of fields) {
        if (!isFieldVisible(field, currentOptions, hint)) continue;
        const v = currentOptions[field.id];
        if (v !== undefined && v !== "") submittedOptions[field.id] = v;
      }

      const body: Record<string, unknown> = {
        providerId,
        prompt,
        options: submittedOptions,
      };
      if (useSystemPrompt && systemPromptId) {
        body.systemPromptId = systemPromptId;
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const bodyJson = await res.json().catch(() => ({}));
        setError(
          (bodyJson as { error?: string }).error ?? `error_${res.status}`,
        );
        return;
      }
      const data = (await res.json()) as GenerateResult;
      setResult(data);
      window.dispatchEvent(
        new CustomEvent("history:append", { detail: data }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[generate] client error:", msg, err);
      setError(`network_error: ${msg}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
      <ProviderSelect
        providers={providers}
        value={providerId}
        onChange={setProviderId}
        disabled={pending}
      />
      <ProviderOptions
        fields={currentProvider?.optionFields ?? []}
        values={currentOptions}
        outputFormat={currentProvider?.outputFormat}
        onChange={setOption}
        disabled={pending}
      />
      {currentProvider ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Expected output:</span>{" "}
          {describeOutput(currentProvider.outputFormat, currentOptions)}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={useSystemPrompt}
            onChange={(e) => {
              setUseSystemPrompt(e.target.checked);
              if (!e.target.checked) setSystemPromptId("");
            }}
            disabled={pending}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm font-medium">Use system prompt</span>
        </label>

        {useSystemPrompt && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="system-prompt-select">System prompt</Label>
            {systemPrompts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No system prompts saved yet. Create one in the System Prompts
                section.
              </p>
            ) : (
              <Select
                value={systemPromptId}
                onValueChange={setSystemPromptId}
                disabled={pending}
              >
                <SelectTrigger id="system-prompt-select">
                  <SelectValue placeholder="Select a system prompt…" />
                </SelectTrigger>
                <SelectContent>
                  {systemPrompts.map((sp) => (
                    <SelectItem key={sp.id} value={sp.id}>
                      {sp.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      <PromptForm
        onSubmit={onSubmit}
        disabled={pending || !providerId}
        providerId={providerId}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <ResultPanel pending={pending} result={result} />
    </div>
  );
}

function initialOptions(
  providers: ProviderOption[],
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const p of providers) {
    out[p.id] = Object.fromEntries(
      p.optionFields.map((f) => [f.id, f.defaultValue]),
    );
  }
  return out;
}
