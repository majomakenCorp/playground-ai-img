import "server-only";
import { env } from "@/lib/env";
import type {
  GenerateInput,
  GenerateOutput,
  ImageProvider,
  OutputFormatHint,
  ProviderId,
  ProviderOptionField,
  TokenUsage,
} from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/errors";
import { sniffImageMime } from "@/lib/providers/sniff";
import {
  DEFAULT_EDIT_ASPECT_RATIO,
  DEFAULT_EDIT_IMAGE_SIZE,
  DEFAULT_EDIT_MODEL,
  MODEL_SUPPORTS_IMAGE_SIZE,
  type EditAspectRatio,
  type EditImageSize,
  type EditModel,
} from "@/lib/logo-edit/options";

/**
 * Image-to-image provider for the logo edit page. Port of glyph's
 * `src/lib/providers/edit/gemini-image-edit.ts`.
 *
 * Lives outside the upstream provider boundary (AGENTS.md §6) because
 * `GenerateInput` is text-only and `gemini.ts` is upstream code. It implements
 * `ImageProvider` rather than inventing an interface, with the source image
 * bound at construction, so the route keeps passing `{ prompt }` and never
 * learns there is an image involved.
 *
 * Request shape is glyph's, verbatim: the image is the FIRST part, the prompt
 * the second, `responseModalities` is `["IMAGE"]` only, and there is no
 * `thinkingConfig`. The only playground liberty is that the model, aspect ratio
 * and image size are constructor options instead of constants, so testers can
 * compare models against the same upload.
 */

export const REQUEST_TIMEOUT_MS = 60_000;
export const RETRY_ATTEMPTS = 3;
export const RETRY_BASE_MS = 1500;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
        thoughtSignature?: string;
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  [k: string]: unknown;
}

export interface SourceImage {
  bytes: Buffer;
  mimeType: string;
}

export interface EditOptions {
  model?: EditModel;
  aspectRatio?: EditAspectRatio;
  imageSize?: EditImageSize;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function endpoint(apiKey: string, modelId: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function classifyHttpError(status: number) {
  if (status === 401 || status === 403) return "auth" as const;
  if (status === 429) return "rate_limit" as const;
  if (status === 503) return "rate_limit" as const; // capacity / "high demand"
  if (status === 400) return "invalid_request" as const;
  return "upstream" as const;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Strips every large blob out of the response before it becomes `usage.raw`,
 * which History stores verbatim. Gemini 3 returns two ~180 kB thought
 * signatures per call on top of the base64 image.
 */
export function stripHeavyFields(
  response: GeminiResponse,
): Record<string, unknown> {
  const cloned: Record<string, unknown> = { ...response };
  const candidates = response.candidates;
  if (!Array.isArray(candidates)) return cloned;

  cloned.candidates = candidates.map((c) => {
    if (!c?.content?.parts) return c;
    return {
      ...c,
      content: {
        ...c.content,
        parts: c.content.parts.map((p) => {
          const out: Record<string, unknown> = { ...p };
          if (p.inlineData?.data) {
            out.inlineData = {
              mimeType: p.inlineData.mimeType,
              data: `[base64 stripped, ${p.inlineData.data.length} chars]`,
            };
          }
          if (typeof p.thoughtSignature === "string") {
            out.thoughtSignature = `[stripped, ${p.thoughtSignature.length} chars]`;
          }
          return out;
        }),
      },
    };
  });
  return cloned;
}

export class GeminiImageEditProvider implements ImageProvider {
  // Same id as the from-scratch provider: it is the same endpoint being
  // billed, and `aggregateUsage` groups by this id.
  readonly id: ProviderId = "gemini-nano-banana-2";
  readonly displayName = "Gemini · Nano Banana 2 (edit)";

  readonly outputFormat: OutputFormatHint = {
    rules: [],
    defaultLabel: "Raster image (PNG, .png)",
  };

  /** The edit form owns its options; no generic provider options form. */
  readonly optionFields: ProviderOptionField[] = [];

  readonly model: EditModel;
  readonly aspectRatio: EditAspectRatio;
  /** `null` when the model does not accept `imageConfig.imageSize`. */
  readonly imageSize: EditImageSize | null;

  constructor(
    private readonly apiKey: string,
    private readonly source: SourceImage,
    opts: EditOptions = {},
  ) {
    this.model = opts.model ?? DEFAULT_EDIT_MODEL;
    this.aspectRatio = opts.aspectRatio ?? DEFAULT_EDIT_ASPECT_RATIO;
    this.imageSize = MODEL_SUPPORTS_IMAGE_SIZE[this.model]
      ? (opts.imageSize ?? DEFAULT_EDIT_IMAGE_SIZE)
      : null;
  }

  buildBody(prompt: string): Record<string, unknown> {
    const imageConfig: Record<string, unknown> = {
      aspectRatio: this.aspectRatio,
    };
    if (this.imageSize !== null) imageConfig.imageSize = this.imageSize;

    return {
      contents: [
        {
          role: "user",
          // Image first, then the instruction. The model reads the reference
          // before being told what to do with it.
          parts: [
            {
              inlineData: {
                mimeType: this.source.mimeType,
                data: this.source.bytes.toString("base64"),
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig,
      },
    };
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const body = this.buildBody(input.prompt);
    const url = endpoint(this.apiKey, this.model);

    let res: Response | null = null;
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      const attemptStartedAt = performance.now();
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        console.log(
          `[gemini-image-edit] attempt ${attempt + 1}/${RETRY_ATTEMPTS} status=${res.status} ` +
            `ms=${Math.round(performance.now() - attemptStartedAt)} model=${this.model}`,
        );
      } catch (err) {
        lastErr = err;
        const ms = Math.round(performance.now() - attemptStartedAt);
        if ((err as { name?: string })?.name === "AbortError") {
          console.error(
            `[gemini-image-edit] attempt ${attempt + 1}/${RETRY_ATTEMPTS} timeout after ${ms} ms`,
          );
          throw new ProviderError({
            kind: "timeout",
            providerId: this.id,
            message: `Gemini timeout after ${REQUEST_TIMEOUT_MS} ms`,
          });
        }
        console.error(
          `[gemini-image-edit] attempt ${attempt + 1}/${RETRY_ATTEMPTS} network error ms=${ms}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
        if (attempt < RETRY_ATTEMPTS - 1) {
          await sleep(RETRY_BASE_MS * 2 ** attempt);
          continue;
        }
        throw new ProviderError({
          kind: "upstream",
          providerId: this.id,
          message: "Gemini network error",
          upstream: err instanceof Error ? err.message : String(err),
        });
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 503 && attempt < RETRY_ATTEMPTS - 1) {
        await sleep(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      break;
    }

    if (!res) {
      throw new ProviderError({
        kind: "upstream",
        providerId: this.id,
        message: "Gemini network error",
        upstream: lastErr instanceof Error ? lastErr.message : String(lastErr),
      });
    }

    if (!res.ok) {
      const errBody = await safeText(res);
      console.error(
        `[gemini-image-edit] HTTP ${res.status}: ${errBody.slice(0, 800)}`,
      );
      throw new ProviderError({
        kind: classifyHttpError(res.status),
        providerId: this.id,
        message: `Gemini ${res.status}`,
        upstream: errBody,
      });
    }

    const json = (await res.json()) as GeminiResponse;
    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      console.error(
        `[gemini-image-edit] no image in response. finishReason=${candidate?.finishReason ?? "?"} ` +
          `parts=${parts.length}`,
      );
      throw new ProviderError({
        kind: "upstream",
        providerId: this.id,
        message: "Gemini returned no image data",
        upstream: stripHeavyFields(json),
      });
    }

    const imageBytes = Buffer.from(imagePart.inlineData.data, "base64");
    const mimeType =
      imagePart.inlineData.mimeType || sniffImageMime(imageBytes) || "image/png";

    const u = json.usageMetadata;
    const usage: TokenUsage = {
      inputTokens: u?.promptTokenCount ?? 0,
      outputTokens: u?.candidatesTokenCount ?? 0,
      totalTokens:
        u?.totalTokenCount ??
        (u?.promptTokenCount ?? 0) + (u?.candidatesTokenCount ?? 0),
      raw: stripHeavyFields(json),
    };

    return {
      imageBytes,
      mimeType,
      usage,
      providerMetadata: {
        source: "gemini-image-edit",
        model: this.model,
        finishReason: candidate?.finishReason ?? null,
        aspectRatio: this.aspectRatio,
        imageSize: this.imageSize,
        edit: true,
      },
    };
  }
}

/**
 * Builds an `ImageProvider` that edits `source` instead of designing from
 * nothing. Callers keep passing `{ prompt }`.
 */
export function createGeminiImageEditProvider(
  source: SourceImage,
  opts: EditOptions = {},
): ImageProvider {
  return new GeminiImageEditProvider(env.GEMINI_API_KEY, source, opts);
}
