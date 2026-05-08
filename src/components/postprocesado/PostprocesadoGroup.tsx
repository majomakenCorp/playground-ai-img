import Link from "next/link";
import { Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuadrantCard, type QuadrantCardData } from "@/components/postprocesado/QuadrantCard";

const TRANSPARENT_CHECKER_BG =
  "bg-[length:16px_16px] bg-[conic-gradient(at_50%_50%,#e5e7eb_25%,transparent_0,transparent_50%,#e5e7eb_0,#e5e7eb_75%,transparent_0)]";

export interface PostprocesadoGroupData {
  parent: {
    id: string;
    createdAt: string;
    providerId: string;
    prompt: string;
    imageUrl: string;
    mimeType: string;
  };
  quadrants: QuadrantCardData[];
}

export function PostprocesadoGroup({ group }: { group: PostprocesadoGroupData }) {
  const orderedQuadrants = [...group.quadrants].sort(
    (a, b) => a.quadrantIndex - b.quadrantIndex,
  );
  const vectors = orderedQuadrants.filter((q) => q.vectorVariant);

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-4">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={group.parent.imageUrl}
              alt=""
              className="size-16 shrink-0 rounded-sm border border-border object-cover"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <Badge variant="secondary" className="w-fit">Original</Badge>
              <p className="line-clamp-2 text-sm">{group.parent.prompt}</p>
              <p className="text-xs text-muted-foreground">
                {group.parent.providerId} ·{" "}
                {new Date(group.parent.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/history/${group.parent.id}`}>Open original →</Link>
          </Button>
        </header>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-quadrant">
            Quadrants
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {orderedQuadrants.map((q) => (
              <QuadrantCard key={q.id} q={q} />
            ))}
          </div>
        </section>

        {vectors.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-vector">
              Vectorized
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {vectors.map((q) => (
                <div
                  key={`${q.id}-svg`}
                  className="flex flex-col gap-2 rounded-md border border-vector/40 p-2"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-vector">
                    <span>Q{q.quadrantIndex} · SVG</span>
                    <span className="rounded-sm bg-vector/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      SVG
                    </span>
                  </div>
                  <div className={`rounded-sm border border-border ${TRANSPARENT_CHECKER_BG}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/images/${q.id}?variant=vector`}
                      alt={`Q${q.quadrantIndex} vectorized`}
                      className="aspect-square w-full rounded-sm object-contain"
                    />
                  </div>
                  <Button asChild size="sm" variant="ghost" className="w-full">
                    <a
                      href={`/api/images/${q.id}?variant=vector`}
                      download={q.vectorVariant?.filename ?? `${q.id}.svg`}
                    >
                      <Download className="size-4" aria-hidden />
                      SVG
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
