import { NextResponse } from "next/server";
import { getBrief } from "@/lib/storage/briefs";
import { UuidV7Schema } from "@/lib/validation/schemas";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsed = UuidV7Schema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  try {
    const item = await getBrief(parsed.data);
    if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (err) {
    console.error("[briefs] get failed", err);
    return NextResponse.json({ error: "briefs_failed" }, { status: 503 });
  }
}
