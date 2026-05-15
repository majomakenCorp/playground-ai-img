import "server-only";
import type {
  GenerateInput,
  GenerateOutput,
  ImageProvider,
  OutputFormatHint,
  ProviderId,
  ProviderOptionChoice,
  ProviderOptionField,
  TokenUsage,
} from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/errors";
import { sniffImageMime } from "@/lib/providers/sniff";

const REQUEST_TIMEOUT_MS = 2_147_483_647;

// Real Google model IDs. The "Nano Banana" names are Google's user-facing
// branding; the model_id sent to the API is the gemini-* string.
//   Nano Banana 2  → gemini-3.1-flash-image-preview  (Flash, balanced)
//   Nano Banana    → gemini-2.5-flash-image          (fastest, fixed 1024px)
//   Nano Banana Pro→ gemini-3-pro-image-preview      (best quality, slowest)
const GEMINI_MODELS = [
  "gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
] as const;
type GeminiModel = (typeof GEMINI_MODELS)[number];
const DEFAULT_MODEL: GeminiModel = "gemini-3.1-flash-image-preview";

function endpoint(apiKey: string, modelId: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

// Standard ratios supported by every image model.
const STANDARD_ASPECTS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
  "3:2",
  "2:3",
  "5:4",
  "4:5",
] as const;
// Extra-narrow ratios are 3.1 Flash only.
const EXTRA_NARROW_ASPECTS = ["4:1", "1:4", "8:1", "1:8"] as const;
const ASPECT_RATIOS = [
  ...STANDARD_ASPECTS,
  ...EXTRA_NARROW_ASPECTS,
] as const;
type AspectRatio = (typeof ASPECT_RATIOS)[number];

// Per docs: imageSize accepts "512", "1K", "2K", "4K" (uppercase K). 3 Pro
// drops "512"; 2.5 Flash does not accept this parameter at all.
const IMAGE_SIZES = ["512", "1K", "2K", "4K"] as const;
type ImageSize = (typeof IMAGE_SIZES)[number];

// Per docs: thinkingLevel is supported only on 3.1 Flash. 3 Pro has thinking
// always on; 2.5 Flash does not support thinking at all.
const THINKING_LEVELS = ["minimal", "high"] as const;
type ThinkingLevel = (typeof THINKING_LEVELS)[number];

// responseModalities is either ["IMAGE"] or ["TEXT","IMAGE"], all models.
const MODALITIES = ["IMAGE", "TEXT_AND_IMAGE"] as const;
type Modality = (typeof MODALITIES)[number];

interface ModelCaps {
  aspects: readonly AspectRatio[];
  imageSizes: readonly ImageSize[] | null;
  thinkingLevel: boolean;
}
const MODEL_CAPS: Record<GeminiModel, ModelCaps> = {
  "gemini-3.1-flash-image-preview": {
    aspects: ASPECT_RATIOS,
    imageSizes: IMAGE_SIZES,
    thinkingLevel: true,
  },
  "gemini-3-pro-image-preview": {
    aspects: STANDARD_ASPECTS,
    imageSizes: ["1K", "2K", "4K"] as const,
    thinkingLevel: false,
  },
  "gemini-2.5-flash-image": {
    aspects: STANDARD_ASPECTS,
    imageSizes: null,
    thinkingLevel: false,
  },
};

const DEFAULT_ASPECT: AspectRatio = "1:1";
const DEFAULT_SIZE: ImageSize = "1K";
const DEFAULT_THINKING: ThinkingLevel = "minimal";
const DEFAULT_MODALITY: Modality = "IMAGE";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
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

export class GeminiProvider implements ImageProvider {
  readonly id: ProviderId = "gemini-nano-banana-2";
  readonly displayName = "Gemini · Nano Banana 2";

  readonly outputFormat: OutputFormatHint = {
    rules: [],
    defaultLabel: "Raster image (PNG, .png)",
  };

  readonly optionFields: ProviderOptionField[] = (() => {
    const aspectChoicesByModel: Record<string, ProviderOptionChoice[]> =
      Object.fromEntries(
        GEMINI_MODELS.map((m) => [
          m,
          MODEL_CAPS[m].aspects.map((v) => ({ value: v, label: v })),
        ]),
      );

    const sizeChoicesByModel: Record<string, ProviderOptionChoice[]> =
      Object.fromEntries(
        GEMINI_MODELS.filter((m) => MODEL_CAPS[m].imageSizes !== null).map(
          (m) => [
            m,
            (MODEL_CAPS[m].imageSizes as readonly ImageSize[]).map((v) => ({
              value: v,
              label: v === "1K" ? "1K (default)" : v === "512" ? "512 px" : v,
            })),
          ],
        ),
      );

    const thinkingModels = GEMINI_MODELS.filter(
      (m) => MODEL_CAPS[m].thinkingLevel,
    );

    return [
      {
        id: "model_id",
        label: "Model",
        defaultValue: DEFAULT_MODEL,
        choices: [
          {
            value: "gemini-3.1-flash-image-preview",
            label: "Nano Banana 2 (Flash 3.1)",
            description:
              "Balanced speed/quality. Default. Supports thinking levels and 14 aspect ratios incl. 4:1 / 8:1 / 1:4 / 1:8.",
          },
          {
            value: "gemini-2.5-flash-image",
            label: "Nano Banana (Flash 2.5)",
            description:
              "Fastest. Optimized for high-volume, low-latency use. Fixed 1024px resolution; 10 standard aspect ratios.",
          },
          {
            value: "gemini-3-pro-image-preview",
            label: "Nano Banana Pro (Gemini 3 Pro)",
            description:
              "Highest quality, slowest. Built-in thinking; best for complex instructions and accurate text rendering.",
          },
        ],
      },
      {
        id: "aspect_ratio",
        label: "Aspect ratio",
        defaultValue: DEFAULT_ASPECT,
        dependsOn: "model_id",
        choicesByValue: aspectChoicesByModel,
      },
      {
        id: "image_size",
        label: "Resolution",
        defaultValue: DEFAULT_SIZE,
        dependsOn: "model_id",
        choicesByValue: sizeChoicesByModel,
      },
      {
        id: "thinking_level",
        label: "Thinking level",
        defaultValue: DEFAULT_THINKING,
        dependsOn: "model_id",
        visibleWhenParentIn: [...thinkingModels],
        choices: [
          {
            value: "minimal",
            label: "Minimal (default)",
            description:
              "Lower latency. The model spends little to no time on internal reasoning before generating the image.",
          },
          {
            value: "high",
            label: "High",
            description:
              "More internal reasoning before generation. Higher latency and token usage; can improve adherence to complex prompts.",
          },
        ],
      },
      {
        id: "response_modality",
        label: "Response modality",
        defaultValue: DEFAULT_MODALITY,
        choices: [
          {
            value: "IMAGE",
            label: "Image only",
            description: "Returns only the generated image.",
          },
          {
            value: "TEXT_AND_IMAGE",
            label: "Image + text",
            description:
              "Returns the image plus a text caption / commentary from the model. Saved alongside the image.",
          },
        ],
      },
      {
        id: "output_format",
        label: "Output format",
        defaultValue: "original",
        choices: [
          { value: "original", label: "Original (PNG)" },
          { value: "webp", label: "WebP (.webp)" },
          { value: "png", label: "PNG (.png)" },
          { value: "jpg", label: "JPEG (.jpg)" },
        ],
      },
    ];
  })();

  constructor(private readonly apiKey: string) {}

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const modelId = pick(input.options?.model_id, GEMINI_MODELS, DEFAULT_MODEL);
    const caps = MODEL_CAPS[modelId];

    const aspectRatio = pick(
      input.options?.aspect_ratio,
      caps.aspects,
      caps.aspects.includes(DEFAULT_ASPECT) ? DEFAULT_ASPECT : caps.aspects[0],
    );
    const imageSize =
      caps.imageSizes !== null
        ? pick(
            input.options?.image_size,
            caps.imageSizes,
            caps.imageSizes.includes(DEFAULT_SIZE)
              ? DEFAULT_SIZE
              : caps.imageSizes[0],
          )
        : null;
    const thinkingLevel = caps.thinkingLevel
      ? pick(input.options?.thinking_level, THINKING_LEVELS, DEFAULT_THINKING)
      : null;
    const modality = pick(
      input.options?.response_modality,
      MODALITIES,
      DEFAULT_MODALITY,
    );

    const responseModalities =
      modality === "TEXT_AND_IMAGE" ? ["TEXT", "IMAGE"] : ["IMAGE"];

    const imageConfig: Record<string, unknown> = { aspectRatio };
    if (imageSize !== null) imageConfig.imageSize = imageSize;

    const generationConfig: Record<string, unknown> = {
      responseModalities,
      imageConfig,
    };
    if (thinkingLevel !== null) {
      generationConfig.thinkingConfig = { thinkingLevel };
    }

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      generationConfig,
    };
    if (input.systemPrompt) {
      body.system_instruction = { parts: [{ text: input.systemPrompt }] };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(endpoint(this.apiKey, modelId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        throw new ProviderError({
          kind: "timeout",
          providerId: this.id,
          message: "Gemini timeout",
        });
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

    if (!res.ok) {
      const errBody = await safeText(res);
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
      throw new ProviderError({
        kind: "upstream",
        providerId: this.id,
        message: "Gemini returned no image data",
        upstream: json,
      });
    }

    const imageBytes = Buffer.from(imagePart.inlineData.data, "base64");
    const mimeType =
      imagePart.inlineData.mimeType ||
      sniffImageMime(imageBytes) ||
      "image/png";

    const textParts = parts
      .map((p) => p.text)
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0);

    const u = json.usageMetadata;
    const usage: TokenUsage = {
      inputTokens: u?.promptTokenCount ?? 0,
      outputTokens: u?.candidatesTokenCount ?? 0,
      totalTokens:
        u?.totalTokenCount ??
        (u?.promptTokenCount ?? 0) + (u?.candidatesTokenCount ?? 0),
      raw: stripGeminiImageBytes(json),
    };

    const metadata: Record<string, unknown> = {
      source: "gemini",
      model: modelId,
      finishReason: candidate?.finishReason ?? null,
      aspectRatio,
      imageSize: imageSize ?? "fixed-1024",
      thinkingLevel: thinkingLevel ?? "n/a",
      responseModality: modality,
    };
    if (textParts.length > 0) metadata.text = textParts.join("\n\n");

    return {
      imageBytes,
      mimeType,
      usage,
      providerMetadata: metadata,
    };
  }
}

function pick<T extends string>(
  candidate: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (candidate && (allowed as readonly string[]).includes(candidate)) {
    return candidate as T;
  }
  return fallback;
}

function classifyHttpError(status: number) {
  if (status === 401 || status === 403) return "auth" as const;
  if (status === 429 || status === 503) return "rate_limit" as const;
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

function stripGeminiImageBytes(
  response: GeminiResponse,
): Record<string, unknown> {
  const cloned: Record<string, unknown> = { ...response };
  const candidates = response.candidates;
  if (Array.isArray(candidates)) {
    cloned.candidates = candidates.map((c) => {
      if (!c?.content?.parts) return c;
      return {
        ...c,
        content: {
          ...c.content,
          parts: c.content.parts.map((p) => {
            if (p.inlineData?.data) {
              return {
                ...p,
                inlineData: {
                  mimeType: p.inlineData.mimeType,
                  data: `[base64 stripped, ${p.inlineData.data.length} chars]`,
                },
              };
            }
            return p;
          }),
        },
      };
    });
  }
  return cloned;
}
