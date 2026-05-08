import { findPostprocesado } from "@/lib/storage/history";
import {
  PostprocesadoGroup,
  type PostprocesadoGroupData,
} from "@/components/postprocesado/PostprocesadoGroup";

export const dynamic = "force-dynamic";

export default async function PostprocesadoPage() {
  const groups = await findPostprocesado({ limit: 50 });
  const items: PostprocesadoGroupData[] = groups.map((g) => ({
    parent: {
      id: g.parent.id,
      createdAt: g.parent.createdAt,
      providerId: g.parent.providerId,
      prompt: g.parent.prompt,
      imageUrl: `/api/images/${g.parent.id}`,
      mimeType: g.parent.mimeType,
    },
    quadrants: g.quadrants.map((q) => ({
      id: q.id,
      quadrantIndex: q.quadrantIndex ?? 0,
      imageUrl: `/api/images/${q.id}`,
      vectorVariant: q.variants?.vector ?? null,
    })),
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Postprocesado</h1>
        <p className="text-sm text-muted-foreground">
          Quadrants split from generated images, plus their vectorized SVGs.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No post-processed images yet. Open any history item and click{" "}
          <span className="font-medium text-foreground">Split into 4</span>{" "}
          to start.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {items.map((g) => (
            <PostprocesadoGroup key={g.parent.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
