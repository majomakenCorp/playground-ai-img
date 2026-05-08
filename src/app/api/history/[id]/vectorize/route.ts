import { NextResponse } from "next/server";
import { isAllowedOrigin } from "@/lib/auth/origin";
import {
  UuidV7Schema,
  VectorizeOptionsSchema,
} from "@/lib/validation/schemas";
import {
  getHistory,
  setVariant,
  type HistoryVariantKind,
} from "@/lib/storage/history";
import { readImageBytes, writeImage } from "@/lib/storage/images";
import { vectorize } from "@/lib/postprocess/vectorize";

const VARIANT: HistoryVariantKind = "vector";
const RASTER_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const parsed = UuidV7Schema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsedBody = VectorizeOptionsSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  const record = await getHistory(parsed.data);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!RASTER_MIMES.has(record.mimeType)) {
    return NextResponse.json(
      { error: "unsupported_mime" },
      { status: 422 },
    );
  }

  if (record.variants?.[VARIANT]) {
    return NextResponse.json({
      ok: true,
      reused: true,
      variant: record.variants[VARIANT],
    });
  }

  let originalBytes: Buffer;
  try {
    originalBytes = await readImageBytes(record.imageFilename);
  } catch (err) {
    console.error("[vectorize] read failed", err);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  let result;
  try {
    result = await vectorize(originalBytes, { mode: parsedBody.data.mode });
  } catch (err) {
    console.error("[vectorize] trace failed", err);
    return NextResponse.json({ error: "vectorize_failed" }, { status: 500 });
  }

  let variantFilename: string;
  try {
    variantFilename = await writeImage({
      id: parsed.data,
      ext: "svg",
      bytes: result.bytes,
      variant: VARIANT,
    });
  } catch (err) {
    console.error("[vectorize] write failed", err);
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  const variantInfo = {
    filename: variantFilename,
    mimeType: result.mime,
    createdAt: new Date().toISOString(),
  };

  try {
    await setVariant(parsed.data, VARIANT, variantInfo);
  } catch (err) {
    console.error("[vectorize] history update failed", err);
    return NextResponse.json({ error: "history_failed" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    reused: false,
    variant: variantInfo,
  });
}
