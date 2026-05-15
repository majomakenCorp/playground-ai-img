import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { isAllowedOrigin } from "@/lib/auth/origin";
import { GenerateSchema } from "@/lib/validation/schemas";
import { getProvider } from "@/lib/providers/registry";
import { ProviderError, httpStatusFor } from "@/lib/providers/errors";
import { extForMime, writeImage } from "@/lib/storage/images";
import { sniffImageMime } from "@/lib/providers/sniff";
import { convertRaster, isRasterFormat } from "@/lib/storage/convert";
import { insertHistory } from "@/lib/storage/history";
import { getSystemPrompt } from "@/lib/storage/system-prompts";
import { uuidV7 } from "@/lib/uuid";

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const provider = getProvider(parsed.data.providerId);
  if (!provider) {
    return NextResponse.json(
      { error: "unknown_provider" },
      { status: 400 },
    );
  }

  let systemPromptContent: string | undefined;
  if (parsed.data.systemPromptId) {
    const sp = await getSystemPrompt(parsed.data.systemPromptId);
    if (!sp) {
      return NextResponse.json({ error: "system_prompt_not_found" }, { status: 400 });
    }
    systemPromptContent = sp.content;
  }

  let result;
  const generateStartedAt = Date.now();
  try {
    result = await provider.generate({
      prompt: parsed.data.prompt,
      options: parsed.data.options,
      systemPrompt: systemPromptContent,
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      console.error("[generate] provider error", err.kind, err.message);
      // `invalid_request` messages come from our own validation, so they're
      // safe (and useful) to surface. Other kinds may include upstream text;
      // keep those opaque.
      const payload: Record<string, unknown> = {
        error: `provider_${err.kind}`,
      };
      if (err.kind === "invalid_request") payload.detail = err.message;
      return NextResponse.json(payload, { status: httpStatusFor(err.kind) });
    }
    console.error("[generate] unexpected error", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  const durationMs = Date.now() - generateStartedAt;

  // Source-of-truth for the actual image format: sniff the bytes themselves.
  // The provider's stated mime can lie (Gemini sometimes claims PNG for non-PNG
  // bytes; Recraft says nothing). Trust magic bytes over self-reported mime.
  const sniffedMime = sniffImageMime(result.imageBytes);
  let finalMime = sniffedMime ?? result.mimeType;
  let outputBytes = result.imageBytes;
  if (sniffedMime && sniffedMime !== result.mimeType) {
    console.warn(
      "[generate] mime mismatch — provider said",
      result.mimeType,
      "but bytes are",
      sniffedMime,
    );
  }

  // Optional raster→raster conversion. Skipped for SVG (vector → raster would
  // need rasterization at a chosen resolution; out of scope) and for "original".
  const requestedFormat = parsed.data.options?.output_format;
  if (
    requestedFormat &&
    requestedFormat !== "original" &&
    isRasterFormat(requestedFormat) &&
    finalMime !== "image/svg+xml"
  ) {
    try {
      const converted = await convertRaster(outputBytes, requestedFormat);
      outputBytes = converted.bytes;
      finalMime = converted.mime;
    } catch (err) {
      console.error("[generate] convert failed", err);
      return NextResponse.json(
        { error: "convert_failed" },
        { status: 502 },
      );
    }
  }

  const ext = extForMime(finalMime);
  if (!ext) {
    console.error("[generate] unsupported mime", {
      providerMime: result.mimeType,
      sniffedMime,
      finalMime,
    });
    return NextResponse.json(
      { error: "unsupported_mime" },
      { status: 502 },
    );
  }

  const id = uuidV7();
  let imageFilename: string;
  try {
    imageFilename = await writeImage({ id, ext, bytes: outputBytes });
  } catch (err) {
    console.error("[generate] write failed", err);
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }

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
      providerMetadata: result.providerMetadata,
      durationMs,
    });
  } catch (err) {
    console.error("[generate] history insert failed", err);
    return NextResponse.json({ error: "history_failed" }, { status: 503 });
  }

  return NextResponse.json({
    id: record.id,
    providerId: record.providerId,
    prompt: record.prompt,
    imageUrl: `/api/images/${record.id}`,
    mimeType: finalMime,
    usage: {
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      totalTokens: record.totalTokens,
      raw: record.rawUsage,
    },
    durationMs: record.durationMs,
    providerMetadata: result.providerMetadata,
    createdAt: record.createdAt,
  });
}
