import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { isAllowedOrigin } from "@/lib/auth/origin";
import { EditFieldsSchema } from "@/lib/validation/schemas";
import { ProviderError, httpStatusFor } from "@/lib/providers/errors";
import { createGeminiImageEditProvider } from "@/lib/providers/gemini-image-edit";
import { extForMime, writeImage } from "@/lib/storage/images";
import { sniffImageMime } from "@/lib/providers/sniff";
import { insertHistory } from "@/lib/storage/history";
import { MAX_UPLOAD_BYTES, ingestSourceImage } from "@/lib/logo-edit/ingest";
import { uuidV7 } from "@/lib/uuid";
import sharp from "sharp";

/**
 * Vercel function budget. Worst case is 3 provider attempts x 60 s plus
 * backoff, ingest, two storage writes and the history insert.
 */
export const maxDuration = 300;

/**
 * Multipart bodies carry the prompt (up to 32 k chars, so up to ~96 kB in
 * UTF-8) and boundary overhead on top of the image. The header check is a
 * cheap first gate; `file.size` is the real one after parsing.
 */
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

function textField(form: FormData, name: string): string | undefined {
  const v = form.get(name);
  return typeof v === "string" && v !== "" ? v : undefined;
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_image" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const parsed = EditFieldsSchema.safeParse({
    prompt: form.get("prompt") ?? "",
    model: textField(form, "model"),
    aspect_ratio: textField(form, "aspect_ratio"),
    image_size: textField(form, "image_size"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ingested = await ingestSourceImage(Buffer.from(await file.arrayBuffer()));
  if (!ingested.ok) {
    return NextResponse.json({ error: ingested.code }, { status: ingested.status });
  }

  const provider = createGeminiImageEditProvider(
    { bytes: ingested.bytes, mimeType: ingested.mimeType },
    {
      model: parsed.data.model,
      aspectRatio: parsed.data.aspect_ratio,
      imageSize: parsed.data.image_size,
    },
  );

  let result;
  const generateStartedAt = Date.now();
  try {
    result = await provider.generate({ prompt: parsed.data.prompt });
  } catch (err) {
    if (err instanceof ProviderError) {
      console.error("[edit] provider error", err.kind, err.message);
      const payload: Record<string, unknown> = { error: `provider_${err.kind}` };
      if (err.kind === "invalid_request") payload.detail = err.message;
      return NextResponse.json(payload, { status: httpStatusFor(err.kind) });
    }
    console.error("[edit] unexpected error", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  const durationMs = Date.now() - generateStartedAt;

  // Trust magic bytes over the provider's self-reported mime (same rule as
  // /api/generate), then normalize to PNG like glyph does: Gemini often answers
  // JPEG, and the artefact testers compare against is glyph's stored PNG.
  const sniffedMime = sniffImageMime(result.imageBytes) ?? result.mimeType;
  if (!extForMime(sniffedMime)) {
    console.error("[edit] unsupported mime", { providerMime: result.mimeType, sniffedMime });
    return NextResponse.json({ error: "unsupported_mime" }, { status: 502 });
  }
  let outputBytes = result.imageBytes;
  if (sniffedMime !== "image/png") {
    try {
      outputBytes = await sharp(result.imageBytes).png().toBuffer();
    } catch (err) {
      console.error("[edit] png normalization failed", err);
      return NextResponse.json({ error: "convert_failed" }, { status: 502 });
    }
  }
  const finalMime = "image/png";
  const ext = "png";

  const id = uuidV7();
  let imageFilename: string;
  let sourceFilename: string;
  try {
    imageFilename = await writeImage({ id, ext, bytes: outputBytes });
    sourceFilename = await writeImage({
      id,
      ext: "png",
      bytes: ingested.bytes,
      variant: "source",
    });
  } catch (err) {
    console.error("[edit] write failed", err);
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }

  const providerMetadata = {
    ...result.providerMetadata,
    sourceWidth: ingested.width,
    sourceHeight: ingested.height,
  };

  let record;
  try {
    record = await insertHistory({
      id,
      providerId: provider.id,
      prompt: parsed.data.prompt,
      imageFilename,
      mimeType: finalMime,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      rawUsage: result.usage.raw,
      providerMetadata,
      durationMs,
      variants: {
        source: {
          filename: sourceFilename,
          mimeType: "image/png",
          createdAt: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    console.error("[edit] history insert failed", err);
    return NextResponse.json({ error: "history_failed" }, { status: 503 });
  }

  return NextResponse.json({
    id: record.id,
    providerId: record.providerId,
    prompt: record.prompt,
    imageUrl: `/api/images/${record.id}`,
    sourceImageUrl: `/api/images/${record.id}?variant=source`,
    mimeType: finalMime,
    usage: {
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      totalTokens: record.totalTokens,
      raw: record.rawUsage,
    },
    durationMs: record.durationMs,
    providerMetadata,
    createdAt: record.createdAt,
  });
}
