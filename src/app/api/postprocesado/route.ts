import { NextResponse } from "next/server";
import { findPostprocesado } from "@/lib/storage/history";
import { PostprocesadoQuerySchema } from "@/lib/validation/schemas";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = PostprocesadoQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    before: url.searchParams.get("before") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let groups;
  try {
    groups = await findPostprocesado({
      limit: parsed.data.limit,
      before: parsed.data.before ? new Date(parsed.data.before) : undefined,
    });
  } catch (err) {
    console.error("[postprocesado] list failed", err);
    return NextResponse.json({ error: "history_failed" }, { status: 503 });
  }

  return NextResponse.json({
    items: groups.map((g) => ({
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
        createdAt: q.createdAt,
        quadrantIndex: q.quadrantIndex ?? 0,
        imageUrl: `/api/images/${q.id}`,
        mimeType: q.mimeType,
        vectorVariant: q.variants?.vector ?? null,
      })),
    })),
  });
}
