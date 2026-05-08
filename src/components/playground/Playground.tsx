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
  durationMs: number | null;
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

  const promptLimitInfo = useMemo(
    () => computePromptLimit(providerId, currentOptions),
    [providerId, currentOptions],
  );

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
    const submittedProviderId = providerId;
    const submittedAt = new Date();
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
        providerId: submittedProviderId,
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
        const bodyJson = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        const code = bodyJson.error ?? `error_${res.status}`;
        setError(bodyJson.detail ? `${code}: ${bodyJson.detail}` : code);
        return;
      }
      const data = (await res.json()) as GenerateResult;
      setResult(data);
      window.dispatchEvent(
        new CustomEvent("history:append", { detail: data }),
      );
    } catch (err) {
      // Browser network failures (e.g. proxy/Node timeout, wifi blip, tab
      // backgrounded) abort the fetch even though the server-side generation
      // usually finishes and writes to history. Recover by polling history
      // for a fresh entry matching this prompt + provider before surfacing
      // the error.
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[generate] client error:", msg, err);
      const recovered = await tryRecoverFromHistory({
        providerId: submittedProviderId,
        prompt,
        submittedAt,
      });
      if (recovered) {
        setResult(recovered);
        window.dispatchEvent(
          new CustomEvent("history:append", { detail: recovered }),
        );
      } else {
        setError(`network_error: ${msg}`);
      }
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
        promptLimit={promptLimitInfo?.limit}
        limitLabel={promptLimitInfo?.label}
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

// Per Recraft docs (api-reference/appendix#maximum-prompt-length): V2/V3
// family caps prompts at 1000 chars; V4 family caps at 10000. Gemini has no
// public hard cap relevant at the playground scale.
function computePromptLimit(
  providerId: string,
  options: Record<string, string>,
): { limit: number; label: string } | null {
  if (providerId !== "recraft") return null;
  const model = options.model ?? "recraftv3";
  if (model.startsWith("recraftv4")) {
    return { limit: 10_000, label: "Recraft V4" };
  }
  return { limit: 1_000, label: "Recraft V2/V3" };
}

interface HistoryListItem {
  id: string;
  createdAt: string;
  providerId: string;
  prompt: string;
  mimeType?: string;
  imageUrl: string;
}

async function tryRecoverFromHistory(args: {
  providerId: string;
  prompt: string;
  submittedAt: Date;
}): Promise<GenerateResult | null> {
  const RECOVERY_DEADLINE_MS = 8 * 60_000;
  const POLL_INTERVAL_MS = 5_000;
  const deadline = Date.now() + RECOVERY_DEADLINE_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let items: HistoryListItem[] | null = null;
    try {
      const r = await fetch("/api/history?limit=10", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { items?: HistoryListItem[] };
        items = j.items ?? [];
      }
    } catch {
      continue;
    }
    if (!items) continue;
    const match = items.find(
      (it) =>
        it.providerId === args.providerId &&
        it.prompt === args.prompt &&
        new Date(it.createdAt).getTime() >= args.submittedAt.getTime() - 1_000,
    );
    if (match) {
      return {
        id: match.id,
        providerId: match.providerId,
        prompt: match.prompt,
        imageUrl: match.imageUrl,
        mimeType: match.mimeType ?? "image/png",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, raw: null },
        durationMs: null,
        createdAt: match.createdAt,
      };
    }
  }
  return null;
}
