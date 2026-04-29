"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function PromptForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
}) {
  const [prompt, setPrompt] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;
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
        maxLength={4000}
        placeholder="Describe the image you want to generate…"
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {prompt.length} / 4000
        </span>
        <Button type="submit" disabled={disabled || !prompt.trim()}>
          {disabled ? "Generating…" : "Generate"}
        </Button>
      </div>
    </form>
  );
}
