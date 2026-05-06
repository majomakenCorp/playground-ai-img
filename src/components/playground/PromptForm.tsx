"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const RECRAFT_PROMPT_LIMIT = 4000;

export function PromptForm({
  onSubmit,
  disabled,
  providerId,
}: {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  providerId?: string;
}) {
  const [prompt, setPrompt] = useState("");

  const isRecraft = providerId === "recraft";
  const limit = isRecraft ? RECRAFT_PROMPT_LIMIT : undefined;
  const overLimit = isRecraft && prompt.length > RECRAFT_PROMPT_LIMIT;

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
        maxLength={limit}
        placeholder="Describe the image you want to generate…"
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        <span
          className={`text-xs ${overLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}
        >
          {isRecraft
            ? `${prompt.length} / ${RECRAFT_PROMPT_LIMIT}`
            : `${prompt.length} characters`}
        </span>
        <Button type="submit" disabled={disabled || !prompt.trim() || overLimit}>
          {disabled ? "Generating…" : "Generate"}
        </Button>
      </div>
    </form>
  );
}
