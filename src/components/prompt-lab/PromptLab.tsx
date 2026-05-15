"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Copy, Check, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export interface PromptLabEntry {
  id: string;
  providerId: string;
  prompt: string;
  output: string;
  durationMs: number;
  createdAt: string;
}

interface PromptLabProviderOption {
  id: "gemini-text" | "claude-cli";
  label: string;
  description: string;
  available: boolean;
}

const PROMPT_LIMIT = 32000;

export function PromptLab({
  providers,
  initialHistory,
}: {
  providers: PromptLabProviderOption[];
  initialHistory: PromptLabEntry[];
}) {
  const router = useRouter();
  const defaultProvider =
    providers.find((p) => p.available)?.id ?? providers[0]?.id ?? "gemini-text";

  const [providerId, setProviderId] = useState<"gemini-text" | "claude-cli">(
    defaultProvider,
  );
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<PromptLabEntry | null>(
    initialHistory[0] ?? null,
  );
  const [history, setHistory] = useState<PromptLabEntry[]>(initialHistory);
  const [copied, setCopied] = useState(false);

  const overLimit = prompt.length > PROMPT_LIMIT;
  const submitDisabled = pending || !prompt.trim() || overLimit;

  async function submit() {
    setError(null);
    setPending(true);
    setCopied(false);
    try {
      const res = await fetch("/api/prompt-lab/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, prompt: prompt.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | { item: PromptLabEntry }
        | { error?: string };
      if (!res.ok || !("item" in data)) {
        setError(mapError(res.status, (data as { error?: string }).error));
        return;
      }
      setLatest(data.item);
      setHistory((h) => [data.item, ...h].slice(0, 100));
      router.refresh();
    } catch {
      setError("network_error");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!latest) return;
    try {
      await navigator.clipboard.writeText(latest.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked in insecure contexts.
    }
  }

  function loadFromHistory(entry: PromptLabEntry) {
    setProviderId(entry.providerId as "gemini-text" | "claude-cli");
    setPrompt(entry.prompt);
    setLatest(entry);
    setCopied(false);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Prompt Lab</h1>
        <p className="text-sm text-muted-foreground">
          Genera texto con Gemini o Claude. Copia el resultado y pégalo en el
          playground de imagen.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-[200px_1fr] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="provider">Provider</Label>
              <Select
                value={providerId}
                onValueChange={(v) =>
                  setProviderId(v as "gemini-text" | "claude-cli")
                }
              >
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={!p.available}>
                      <div className="flex flex-col">
                        <span>{p.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.available ? p.description : "deshabilitado"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              maxLength={PROMPT_LIMIT}
              placeholder="Describe lo que necesitas. Ej: 'Brand brief de café de especialidad, dame un prompt de logo para Gemini Nano Banana 2.'"
              disabled={pending}
            />
            <div className="flex items-center justify-between">
              <span
                className={`text-xs ${
                  overLimit
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {prompt.length} / {PROMPT_LIMIT}
              </span>
              <Button onClick={submit} disabled={submitDisabled}>
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generando…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Generar
                  </>
                )}
              </Button>
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {pending ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      ) : latest ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border px-2 py-0.5 font-medium">
                  {providerLabel(latest.providerId)}
                </span>
                <span>{latest.durationMs} ms</span>
                <span>·</span>
                <span>{formatTime(latest.createdAt)}</span>
              </div>
              <Button size="sm" onClick={copy}>
                {copied ? (
                  <>
                    <Check className="size-3.5" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Copiar
                  </>
                )}
              </Button>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-4 text-sm">
              {latest.output}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {history.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Historial ({history.length})
          </h2>
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => loadFromHistory(entry)}
                  className="flex w-full flex-col gap-1 rounded-md border border-border bg-background p-3 text-left text-sm transition-colors hover:bg-muted"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {providerLabel(entry.providerId)}
                    </span>
                    <span>{formatTime(entry.createdAt)}</span>
                  </div>
                  <span className="line-clamp-1 text-foreground">
                    {entry.prompt}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {entry.output}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function providerLabel(id: string): string {
  if (id === "gemini-text") return "Gemini";
  if (id === "claude-cli") return "Claude";
  return id;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function mapError(status: number, code: string | undefined): string {
  if (status === 401) return "Sesión expirada. Vuelve a iniciar sesión.";
  if (status === 403) return "Origen no permitido.";
  if (status === 504) return "El provider tardó demasiado en responder.";
  if (status === 502) return "Error del provider. Intenta de nuevo.";
  if (status === 400 && code === "invalid_request") {
    return "Provider deshabilitado o prompt inválido.";
  }
  return "Error al generar. Intenta de nuevo.";
}
