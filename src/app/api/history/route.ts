import { NextResponse } from "next/server";
import { listHistory } from "@/lib/storage/history";
import { HistoryQuerySchema } from "@/lib/validation/schemas";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = HistoryQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    before: url.searchParams.get("before") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let rows;
  try {
    rows = await listHistory({
      limit: parsed.data.limit,
      before: parsed.data.before ? new Date(parsed.data.before) : undefined,
    });
  } catch (err) {
    console.error("[history] list failed", err);
    return NextResponse.json({ error: "history_failed" }, { status: 503 });
  }

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      providerId: r.providerId,
      prompt: r.prompt,
      mimeType: r.mimeType,
      imageUrl: `/api/images/${r.id}`,
    })),
  });
}
