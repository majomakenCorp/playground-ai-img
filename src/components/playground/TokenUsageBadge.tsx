"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { GenerateResult } from "@/components/playground/Playground";

export function TokenUsageBadge({
  usage,
  durationMs,
}: {
  usage: GenerateResult["usage"];
  durationMs?: number | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">in {usage.inputTokens}</Badge>
        <Badge variant="secondary">out {usage.outputTokens}</Badge>
        <Badge>total {usage.totalTokens}</Badge>
        {typeof durationMs === "number" ? (
          <Badge variant="outline">⏱ {formatDuration(durationMs)}</Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">tokens / units</span>
      </div>
      <Collapsible>
        <CollapsibleTrigger className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          Raw usage
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(usage.raw, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}
