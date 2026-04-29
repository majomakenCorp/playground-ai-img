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
}: {
  usage: GenerateResult["usage"];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">in {usage.inputTokens}</Badge>
        <Badge variant="secondary">out {usage.outputTokens}</Badge>
        <Badge>total {usage.totalTokens}</Badge>
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
