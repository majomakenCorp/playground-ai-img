import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VectorizeButton } from "@/components/postprocesado/VectorizeButton";

export interface QuadrantCardData {
  id: string;
  quadrantIndex: number;
  imageUrl: string;
  vectorVariant: { filename: string; mimeType: string; createdAt: string } | null;
}

const POSITION_LABELS = ["Q0 · top-left", "Q1 · top-right", "Q2 · bottom-left", "Q3 · bottom-right"];

export function QuadrantCard({ q }: { q: QuadrantCardData }) {
  const positionLabel = POSITION_LABELS[q.quadrantIndex] ?? `Q${q.quadrantIndex}`;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-quadrant/40 p-2">
      <div className="flex items-center justify-between text-xs font-medium text-quadrant">
        <span>{positionLabel}</span>
        <span className="rounded-sm bg-quadrant/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          PNG
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={q.imageUrl}
        alt={positionLabel}
        className="aspect-square w-full rounded-sm border border-border bg-muted/30 object-contain"
      />
      <div className="flex flex-col gap-2">
        <VectorizeButton id={q.id} alreadyVectorized={Boolean(q.vectorVariant)} />
        <Button asChild size="sm" variant="ghost" className="w-full">
          <a href={q.imageUrl} download={`${q.id}.png`}>
            <Download className="size-4" aria-hidden />
            PNG
          </a>
        </Button>
      </div>
    </div>
  );
}
