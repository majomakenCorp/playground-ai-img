"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface VariantInfo {
  filename: string;
  mimeType: string;
  createdAt: string;
}

const TRANSPARENT_CHECKER_BG =
  "bg-[length:16px_16px] bg-[conic-gradient(at_50%_50%,#e5e7eb_25%,transparent_0,transparent_50%,#e5e7eb_0,#e5e7eb_75%,transparent_0)]";

export function ImageVariants({
  id,
  prompt,
  imageFilename,
  mimeType,
  transparentVariant,
}: {
  id: string;
  prompt: string;
  imageFilename: string;
  mimeType: string;
  transparentVariant: VariantInfo | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SUPPORTS_BG_STRIP = new Set([
    "image/svg+xml",
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);
  const supportsBgStrip = SUPPORTS_BG_STRIP.has(mimeType);

  async function onStrip() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/history/${id}/strip-background`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        removed?: boolean;
      };
      if (!res.ok) {
        if (body.error === "no_background_detected") {
          setError("No removable background detected in this SVG.");
        } else {
          setError(body.error ?? `error_${res.status}`);
        }
        return;
      }
      router.refresh();
    } catch {
      setError("network_error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {transparentVariant ? (
        <div className="grid gap-4 md:grid-cols-2">
          <VariantPanel
            title="Original"
            label="Download original"
            src={`/api/images/${id}`}
            alt={prompt}
            downloadName={imageFilename}
          />
          <VariantPanel
            title="Without background"
            label="Download without background"
            src={`/api/images/${id}?variant=transparent`}
            alt={`${prompt} (transparent)`}
            downloadName={transparentVariant.filename}
            checker
          />
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/images/${id}`}
            alt={prompt}
            className="w-full rounded-md border border-border"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {supportsBgStrip ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onStrip}
                disabled={pending}
              >
                <Eraser className="size-4" aria-hidden />
                {pending ? "Removing background…" : "Remove background"}
              </Button>
            ) : null}
            <Button asChild size="sm">
              <a href={`/api/images/${id}`} download={imageFilename}>
                <Download className="size-4" aria-hidden />
                Download
              </a>
            </Button>
          </div>
        </>
      )}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function VariantPanel({
  title,
  label,
  src,
  alt,
  downloadName,
  checker,
}: {
  title: string;
  label: string;
  src: string;
  alt: string;
  downloadName: string;
  checker?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div
        className={`rounded-md border border-border ${
          checker ? TRANSPARENT_CHECKER_BG : ""
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full rounded-md" />
      </div>
      <Button asChild size="sm" className="w-full">
        <a href={src} download={downloadName}>
          <Download className="size-4" aria-hidden />
          {label}
        </a>
      </Button>
    </div>
  );
}
