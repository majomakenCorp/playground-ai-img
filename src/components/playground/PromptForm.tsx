"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function PromptForm({
  onSubmit,
  disabled,
  promptLimit,
  limitLabel,
}: {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  promptLimit?: number;
  limitLabel?: string;
}) {
  const [prompt, setPrompt] = useState("");

  const overLimit = promptLimit !== undefined && prompt.length > promptLimit;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || disabled || overLimit) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Label htmlFor="prompt">Prompt</Label>
      <Textarea
        id="prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        maxLength={promptLimit}
        placeholder="Describe the image you want to generate…"
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        <span
          className={`text-xs ${overLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}
        >
          {promptLimit !== undefined
            ? `${prompt.length} / ${promptLimit}${limitLabel ? ` · ${limitLabel}` : ""}`
            : `${prompt.length} characters`}
        </span>
        <Button type="submit" disabled={disabled || !prompt.trim() || overLimit}>
          {disabled ? "Generating…" : "Generate"}
        </Button>
      </div>
    </form>
  );
}
