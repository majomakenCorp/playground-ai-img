"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Grid2x2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TokenUsageBadge } from "@/components/playground/TokenUsageBadge";
import type { GenerateResult } from "@/components/playground/Playground";

const RASTER_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export function ResultPanel({
  pending,
  result,
}: {
  pending: boolean;
  result: GenerateResult | null;
}) {
  const router = useRouter();
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const supportsSplit = RASTER_MIMES.has(result.mimeType);

  async function onSplit() {
    if (!result) return;
    setError(null);
    setSplitting(true);
    try {
      const res = await fetch(`/api/history/${result.id}/split-quadrants`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `error_${res.status}`);
        return;
      }
      router.push("/postprocesado");
    } catch {
      setError("network_error");
    } finally {
      setSplitting(false);
    }
  }

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
            <div className="flex flex-wrap items-center gap-2">
              {supportsSplit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onSplit}
                  disabled={splitting}
                >
                  <Grid2x2 className="size-4" aria-hidden />
                  {splitting ? "Splitting…" : "Split into 4"}
                </Button>
              ) : null}
              <Button asChild variant="secondary" size="sm">
                <a href={result.imageUrl} download={downloadName}>
                  Download .{ext}
                </a>
              </Button>
            </div>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
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
