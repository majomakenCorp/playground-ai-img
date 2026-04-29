import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { resolveImagePath } from "@/lib/storage/images";
import { UuidV7Schema } from "@/lib/validation/schemas";

const ALLOWED_VARIANTS = new Set(["transparent"]);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const parsed = UuidV7Schema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const rawVariant = url.searchParams.get("variant");
  let variant: string | undefined;
  if (rawVariant) {
    if (!ALLOWED_VARIANTS.has(rawVariant)) {
      return NextResponse.json({ error: "invalid_variant" }, { status: 400 });
    }
    variant = rawVariant;
  }

  const resolved = await resolveImagePath(parsed.data, variant);
  if (!resolved) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const nodeStream = createReadStream(resolved.full);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": resolved.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
