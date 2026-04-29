import { NextResponse } from "next/server";
import { isAllowedOrigin } from "@/lib/auth/origin";
import { UuidV7Schema } from "@/lib/validation/schemas";
import {
  getHistory,
  setVariant,
  type HistoryVariantKind,
} from "@/lib/storage/history";
import {
  readImageBytes,
  resolveImage,
  writeImage,
} from "@/lib/storage/images";
import { stripFullCanvasBackground } from "@/lib/storage/svg";
import { stripRasterBackground } from "@/lib/storage/convert";

const VARIANT: HistoryVariantKind = "transparent";

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

  const record = await getHistory(parsed.data);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (record.variants?.[VARIANT]) {
    return NextResponse.json({
      ok: true,
      removed: true,
      alreadyExisted: true,
      variant: record.variants[VARIANT],
    });
  }

  const isSvg = record.mimeType === "image/svg+xml";
  const isRaster = RASTER_MIMES.has(record.mimeType);
  if (!isSvg && !isRaster) {
    return NextResponse.json(
      { error: "unsupported_mime" },
      { status: 422 },
    );
  }

  const resolved = await resolveImage(parsed.data);
  if (!resolved) {
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }

  let originalBytes: Buffer;
  try {
    originalBytes = await readImageBytes(record.imageFilename);
  } catch (err) {
    console.error("[strip-bg] read failed", err);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  let variantBytes: Buffer;
  let variantMime: string;
  let variantExt: string;

  if (isSvg) {
    const original = originalBytes.toString("utf8");
    const { stripped, removed } = stripFullCanvasBackground(original);
    if (!removed) {
      return NextResponse.json(
        { ok: false, removed: false, error: "no_background_detected" },
        { status: 422 },
      );
    }
    variantBytes = Buffer.from(stripped, "utf8");
    variantMime = "image/svg+xml";
    variantExt = "svg";
  } else {
    let result;
    try {
      result = await stripRasterBackground(originalBytes);
    } catch (err) {
      console.error("[strip-bg] raster strip failed", err);
      return NextResponse.json({ error: "strip_failed" }, { status: 500 });
    }
    if (!result.removed) {
      return NextResponse.json(
        { ok: false, removed: false, error: "no_background_detected" },
        { status: 422 },
      );
    }
    variantBytes = result.bytes;
    variantMime = result.mime;
    variantExt = "png";
  }

  let variantFilename: string;
  try {
    variantFilename = await writeImage({
      id: parsed.data,
      ext: variantExt,
      bytes: variantBytes,
      variant: VARIANT,
    });
  } catch (err) {
    console.error("[strip-bg] write failed", err);
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  const variantInfo = {
    filename: variantFilename,
    mimeType: variantMime,
    createdAt: new Date().toISOString(),
  };

  try {
    await setVariant(parsed.data, VARIANT, variantInfo);
  } catch (err) {
    console.error("[strip-bg] history update failed", err);
    return NextResponse.json({ error: "history_failed" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    removed: true,
    variant: variantInfo,
  });
}
