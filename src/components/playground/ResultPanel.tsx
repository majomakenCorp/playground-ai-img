"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TokenUsageBadge } from "@/components/playground/TokenUsageBadge";
import type { GenerateResult } from "@/components/playground/Playground";

export function ResultPanel({
  pending,
  result,
}: {
  pending: boolean;
  result: GenerateResult | null;
}) {
  if (pending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="flex aspect-square items-center justify-center text-sm text-muted-foreground">
          No image yet. Submit a prompt to generate one.
        </CardContent>
      </Card>
    );
  }

  const ext = extForMime(result.mimeType);
  const downloadName = `${slugify(result.prompt)}-${result.id.slice(0, 8)}.${ext}`;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.imageUrl}
          alt={result.prompt}
          className="w-full rounded-md border border-border"
        />
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Prompt: </span>
            {result.prompt}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TokenUsageBadge usage={result.usage} />
            <Button asChild variant="secondary" size="sm">
              <a href={result.imageUrl} download={downloadName}>
                Download .{ext}
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function extForMime(mime: string): string {
  const m: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return m[mime.toLowerCase()] ?? "bin";
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 40) || "image"
  );
}
