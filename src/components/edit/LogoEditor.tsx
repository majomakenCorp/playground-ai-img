"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TokenUsageBadge } from "@/components/playground/TokenUsageBadge";
import {
  DEFAULT_EDIT_ASPECT_RATIO,
  DEFAULT_EDIT_IMAGE_SIZE,
  DEFAULT_EDIT_MODEL,
  EDIT_ASPECT_RATIOS,
  EDIT_IMAGE_SIZES,
  EDIT_MODEL_CHOICES,
  MODEL_SUPPORTS_IMAGE_SIZE,
  type EditAspectRatio,
  type EditImageSize,
  type EditModel,
} from "@/lib/logo-edit/options";
import {
  DEFAULT_EDIT_INTENSITY,
  EDIT_INTENSITY_LABELS,
  buildGlyphEditTemplate,
  type EditIntensityLabel,
} from "@/lib/logo-edit/glyph-template";

/** Mirrors `MAX_UPLOAD_BYTES` in `src/lib/logo-edit/ingest.ts`. */
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp";
const ACCEPTED_TYPES = new Set(ACCEPT.split(","));
const PROMPT_LIMIT = 32_000;

const ERROR_COPY: Record<string, string> = {
  unauthenticated: "Session expired. Sign in again.",
  missing_image: "Attach a logo first.",
  file_too_large: "The file is over 4 MB.",
  unsupported_image_type: "Only PNG, JPG or WebP are accepted (SVG is rejected on purpose).",
  unreadable_image: "The file could not be decoded as an image.",
  image_too_large: "The image exceeds 8000 px on one side.",
  image_conversion_failed: "The image could not be re-encoded to PNG.",
  provider_rate_limit: "Gemini is at capacity (429/503). Try again in a moment.",
  provider_timeout: "Gemini did not answer within 60 s.",
  provider_auth: "Gemini rejected the API key.",
  provider_upstream: "Gemini returned no image (safety block or upstream error). Check the raw usage.",
  storage_failed: "The result could not be stored (R2).",
  history_failed: "The result was generated but the history insert failed (MongoDB).",
};

export interface EditResult {
  id: string;
  providerId: string;
  prompt: string;
  imageUrl: string;
  sourceImageUrl: string;
  mimeType: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; raw: unknown };
  durationMs: number | null;
  providerMetadata: Record<string, unknown>;
  createdAt: string;
}

export function LogoEditor() {
  const [selected, setSelected] = useState<{ file: File; url: string } | null>(null);
  const file = selected?.file ?? null;
  const previewUrl = selected?.url ?? null;
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<EditModel>(DEFAULT_EDIT_MODEL);
  const [aspectRatio, setAspectRatio] = useState<EditAspectRatio>(DEFAULT_EDIT_ASPECT_RATIO);
  const [imageSize, setImageSize] = useState<EditImageSize>(DEFAULT_EDIT_IMAGE_SIZE);
  const [intensity, setIntensity] = useState<EditIntensityLabel>(DEFAULT_EDIT_INTENSITY);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EditResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs are minted in the pick handler; the cleanup releases the
  // previous one whenever it changes and the last one on unmount.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const supportsSize = MODEL_SUPPORTS_IMAGE_SIZE[model];
  const overLimit = prompt.length > PROMPT_LIMIT;
  const canSubmit = Boolean(file) && prompt.trim().length > 0 && !overLimit && !pending;

  function pick(candidate: File | undefined) {
    setError(null);
    if (!candidate) return;
    if (!ACCEPTED_TYPES.has(candidate.type)) {
      setError(ERROR_COPY.unsupported_image_type);
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setError(ERROR_COPY.file_too_large);
      return;
    }
    setSelected({ file: candidate, url: URL.createObjectURL(candidate) });
  }

  function loadTemplate() {
    const next = buildGlyphEditTemplate(intensity);
    if (prompt.trim() && !window.confirm("Replace the current prompt with the Glyph template?")) {
      return;
    }
    setPrompt(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("prompt", prompt.trim());
      body.append("model", model);
      body.append("aspect_ratio", aspectRatio);
      if (supportsSize) body.append("image_size", imageSize);

      const res = await fetch("/api/edit", { method: "POST", body });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        const code = json.error ?? `error_${res.status}`;
        const copy = ERROR_COPY[code] ?? code;
        setError(json.detail ? `${copy} (${json.detail})` : `${copy} [${code}]`);
        return;
      }
      const data = (await res.json()) as EditResult;
      setResult(data);
      window.dispatchEvent(
        new CustomEvent("history:append", {
          detail: {
            id: data.id,
            createdAt: data.createdAt,
            providerId: data.providerId,
            prompt: data.prompt,
            imageUrl: data.imageUrl,
          },
        }),
      );
    } catch (err) {
      setError(`network_error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Edit logo</h1>
        <p className="text-sm text-muted-foreground">
          Same request glyph sends in production: the logo goes first as inline
          image data, the prompt second, image-only output, no thinking. Only the
          model is a free choice here.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="logo-file">Existing logo</Label>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex min-h-40 cursor-pointer items-center justify-center gap-4 rounded-md border border-dashed p-4 text-sm transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
            }`}
          >
            {previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Selected logo"
                  className="max-h-40 max-w-[50%] rounded-sm border border-border bg-white object-contain"
                />
                <div className="flex min-w-0 flex-col gap-1 text-left">
                  <span className="truncate font-medium">{file?.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {file ? `${(file.size / 1024).toFixed(0)} kB · ${file.type}` : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Click or drop another file to replace it.
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="size-6" aria-hidden />
                <span>Drop a PNG, JPG or WebP here, or click to choose one</span>
                <span className="text-xs">Max 4 MB · re-encoded to PNG server-side · SVG rejected</span>
              </div>
            )}
            <input
              ref={inputRef}
              id="logo-file"
              type="file"
              accept={ACCEPT}
              className="hidden"
              disabled={pending}
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Label htmlFor="edit-prompt">Prompt</Label>
            <div className="flex items-center gap-2">
              <Select
                value={intensity}
                onValueChange={(v) => setIntensity(v as EditIntensityLabel)}
                disabled={pending}
              >
                <SelectTrigger className="h-8 w-44 text-xs" aria-label="Glyph intensity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDIT_INTENSITY_LABELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadTemplate}
                disabled={pending}
              >
                <FileText className="size-4" aria-hidden />
                Load Glyph template
              </Button>
            </div>
          </div>
          <Textarea
            id="edit-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={10}
            maxLength={PROMPT_LIMIT}
            placeholder="Describe how the attached logo should change… or load the Glyph template and fill in the bracketed placeholders."
            disabled={pending}
            className="font-mono text-xs"
          />
          <span
            className={`text-xs ${overLimit ? "font-medium text-destructive" : "text-muted-foreground"}`}
          >
            {prompt.length} / {PROMPT_LIMIT}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-model">Model</Label>
            <Select
              value={model}
              onValueChange={(v) => setModel(v as EditModel)}
              disabled={pending}
            >
              <SelectTrigger id="edit-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDIT_MODEL_CHOICES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex flex-col">
                      <span>{c.label}</span>
                      <span className="text-xs text-muted-foreground">{c.description}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="font-mono text-xs text-muted-foreground">{model}</span>
          </div>

          <Collapsible className="flex flex-col gap-2">
            <CollapsibleTrigger className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline">
              Advanced (deviates from glyph: 1:1 · 1K)
            </CollapsibleTrigger>
            <CollapsibleContent className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-aspect">Aspect ratio</Label>
                <Select
                  value={aspectRatio}
                  onValueChange={(v) => setAspectRatio(v as EditAspectRatio)}
                  disabled={pending}
                >
                  <SelectTrigger id="edit-aspect">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDIT_ASPECT_RATIOS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-size">Image size</Label>
                <Select
                  value={imageSize}
                  onValueChange={(v) => setImageSize(v as EditImageSize)}
                  disabled={pending || !supportsSize}
                >
                  <SelectTrigger id="edit-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDIT_IMAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!supportsSize ? (
                  <span className="text-xs text-muted-foreground">
                    Ignored by this model (fixed 1024px).
                  </span>
                ) : null}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="flex items-center justify-end">
          <Button type="submit" disabled={!canSubmit}>
            {pending ? "Editing…" : "Edit logo"}
          </Button>
        </div>
      </form>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <EditResultPanel pending={pending} result={result} localPreviewUrl={previewUrl} />
    </div>
  );
}

function EditResultPanel({
  pending,
  result,
  localPreviewUrl,
}: {
  pending: boolean;
  result: EditResult | null;
  localPreviewUrl: string | null;
}) {
  if (pending) {
    return (
      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
          No edit yet. Attach a logo, write or load a prompt, and submit.
        </CardContent>
      </Card>
    );
  }

  const ext = result.mimeType === "image/webp" ? "webp" : result.mimeType === "image/jpeg" ? "jpg" : "png";
  const downloadName = `edit-${result.id.slice(0, 8)}.${ext}`;
  const meta = result.providerMetadata ?? {};

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <VariantPanel
            title="Before (normalized source)"
            src={result.sourceImageUrl}
            fallbackSrc={localPreviewUrl}
            alt="Source logo"
          />
          <VariantPanel title="After (edited)" src={result.imageUrl} alt="Edited logo" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TokenUsageBadge usage={result.usage} durationMs={result.durationMs} />
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <a href={result.imageUrl} download={downloadName}>
                <Download className="size-4" aria-hidden />
                Download .{ext}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/history/${result.id}`}>Open in history</Link>
            </Button>
          </div>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {String(meta.model ?? "")} · {String(meta.aspectRatio ?? "")}
          {meta.imageSize ? ` · ${String(meta.imageSize)}` : ""}
          {meta.finishReason ? ` · ${String(meta.finishReason)}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function VariantPanel({
  title,
  src,
  fallbackSrc,
  alt,
}: {
  title: string;
  src: string;
  fallbackSrc?: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  const shown = failed && fallbackSrc ? fallbackSrc : src;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shown}
        alt={alt}
        onError={() => setFailed(true)}
        className="w-full rounded-md border border-border bg-white"
      />
    </div>
  );
}
