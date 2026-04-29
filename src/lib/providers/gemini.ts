import "server-only";
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

// Nano Banana 2 (preview) — per ai.google.dev/gemini-api/docs/models.
const MODEL_ID = "gemini-3.1-flash-image-preview";
const REQUEST_TIMEOUT_MS = 120_000;

function endpoint(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

// Per docs: 14 supported aspect ratios.
const ASPECT_RATIOS = [
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
  "4:1",
  "1:4",
  "8:1",
  "1:8",
] as const;
type AspectRatio = (typeof ASPECT_RATIOS)[number];

// Per docs: imageSize accepts "512", "1K", "2K", "4K" (uppercase K).
const IMAGE_SIZES = ["512", "1K", "2K", "4K"] as const;
type ImageSize = (typeof IMAGE_SIZES)[number];

// Per docs: thinkingLevel is "minimal" (default) or "high".
const THINKING_LEVELS = ["minimal", "high"] as const;
type ThinkingLevel = (typeof THINKING_LEVELS)[number];

// Per docs: responseModalities is either ["IMAGE"] or ["TEXT","IMAGE"].
const MODALITIES = ["IMAGE", "TEXT_AND_IMAGE"] as const;
type Modality = (typeof MODALITIES)[number];

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

  readonly optionFields: ProviderOptionField[] = [
    {
      id: "aspect_ratio",
      label: "Aspect ratio",
      defaultValue: DEFAULT_ASPECT,
      choices: (ASPECT_RATIOS as readonly AspectRatio[]).map((v) => ({
        value: v,
        label: v,
      })),
    },
    {
      id: "image_size",
      label: "Resolution",
      defaultValue: DEFAULT_SIZE,
      choices: [
        { value: "512", label: "512 px" },
        { value: "1K", label: "1K (default)" },
        { value: "2K", label: "2K" },
        { value: "4K", label: "4K" },
      ],
    },
    {
      id: "thinking_level",
      label: "Thinking level",
      defaultValue: DEFAULT_THINKING,
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

  constructor(private readonly apiKey: string) {}

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const aspectRatio = pick(
      input.options?.aspect_ratio,
      ASPECT_RATIOS,
      DEFAULT_ASPECT,
    );
    const imageSize = pick(
      input.options?.image_size,
      IMAGE_SIZES,
      DEFAULT_SIZE,
    );
    const thinkingLevel = pick(
      input.options?.thinking_level,
      THINKING_LEVELS,
      DEFAULT_THINKING,
    );
    const modality = pick(
      input.options?.response_modality,
      MODALITIES,
      DEFAULT_MODALITY,
    );

    const responseModalities =
      modality === "TEXT_AND_IMAGE" ? ["TEXT", "IMAGE"] : ["IMAGE"];

    const body = {
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      generationConfig: {
        responseModalities,
        imageConfig: { aspectRatio, imageSize },
        thinkingConfig: { thinkingLevel },
      },
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(endpoint(this.apiKey), {
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
      source: "gemini-3.1",
      model: MODEL_ID,
      finishReason: candidate?.finishReason ?? null,
      aspectRatio,
      imageSize,
      thinkingLevel,
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
  if (status === 429) return "rate_limit" as const;
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
