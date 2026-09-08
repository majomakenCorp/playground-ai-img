import { notFound } from "next/navigation";
import Link from "next/link";
import { getHistory } from "@/lib/storage/history";
import { getProvider } from "@/lib/providers/registry";
import { UuidV7Schema } from "@/lib/validation/schemas";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageVariants } from "@/components/history/ImageVariants";

export const dynamic = "force-dynamic";

const PROVIDER_LABELS: Record<string, string> = {
  recraft: "Recraft",
  "gemini-nano-banana-2": "Gemini · Nano Banana 2",
};

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UuidV7Schema.safeParse(id).success) notFound();

  const record = await getHistory(id);
  if (!record) notFound();

  const provider = getProvider(record.providerId);
  const providerLabel =
    provider?.displayName ??
    PROVIDER_LABELS[record.providerId] ??
    record.providerId;

  const meta = record.providerMetadata ?? {};
  const aiText = typeof meta.text === "string" ? meta.text : null;
  const metaPairs = Object.entries(meta).filter(
    ([k]) => k !== "source" && k !== "text",
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← Back to playground</Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          {new Date(record.createdAt).toLocaleString()}
        </span>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 p-4">
          <ImageVariants
            id={record.id}
            prompt={record.prompt}
            imageFilename={record.imageFilename}
            mimeType={record.mimeType}
            transparentVariant={record.variants?.transparent ?? null}
            vectorVariant={record.variants?.vector ?? null}
            sourceVariant={record.variants?.source ?? null}
            alreadySplit={(record.childIds?.length ?? 0) === 4}
          />

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Prompt
            </h2>
            <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
              {record.prompt}
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Provider
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{providerLabel}</Badge>
              {metaPairs.map(([k, v]) => (
                <Badge key={k} variant="secondary">
                  {k}: {String(v ?? "—")}
                </Badge>
              ))}
              {metaPairs.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  No additional options recorded.
                </span>
              ) : null}
            </div>
          </section>

          {aiText ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Model response (text)
              </h2>
              <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                {aiText}
              </p>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Usage (tokens / units)
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <UsageStat label="Input" value={record.inputTokens} />
              <UsageStat label="Output" value={record.outputTokens} />
              <UsageStat label="Total" value={record.totalTokens} highlight />
              <UsageStat
                label="Duration"
                value={record.durationMs ?? 0}
                formatted={
                  record.durationMs !== null
                    ? formatDurationLong(record.durationMs)
                    : "—"
                }
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Raw provider usage
            </h2>
            <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
              {JSON.stringify(record.rawUsage, null, 2)}
            </pre>
          </section>

          <section className="flex flex-col gap-2 text-xs text-muted-foreground">
            <div>
              <span className="font-medium">ID:</span>{" "}
              <span className="font-mono">{record.id}</span>
            </div>
            <div>
              <span className="font-medium">File:</span>{" "}
              <span className="font-mono">{record.imageFilename}</span> (
              {record.mimeType})
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function UsageStat({
  label,
  value,
  highlight,
  formatted,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  formatted?: string;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        highlight
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-lg tabular-nums">
        {formatted ?? value.toLocaleString()}
      </div>
    </div>
  );
}

function formatDurationLong(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}
