import "server-only";
import type {
  GenerateInput,
  GenerateOutput,
  ImageProvider,
  OutputFormatHint,
  ProviderBalance,
  ProviderId,
  ProviderOptionChoice,
  ProviderOptionField,
  TokenUsage,
} from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/errors";
import { sniffImageMime } from "@/lib/providers/sniff";

const RECRAFT_BASE = "https://external.api.recraft.ai/v1";
const RECRAFT_ENDPOINT = `${RECRAFT_BASE}/images/generations`;
const RECRAFT_USER_ENDPOINT = `${RECRAFT_BASE}/users/me`;
const REQUEST_TIMEOUT_MS = 2_147_483_647;

// Full model list per https://www.recraft.ai/docs/api-reference/endpoints
const MODELS = [
  "recraftv4",
  "recraftv4_vector",
  "recraftv4_pro",
  "recraftv4_pro_vector",
  "recraftv3",
  "recraftv3_vector",
  "recraftv2",
  "recraftv2_vector",
] as const;
type RecraftModel = (typeof MODELS)[number];

const MODEL_LABELS: Record<RecraftModel, string> = {
  recraftv4: "Recraft V4",
  recraftv4_vector: "Recraft V4 (vector)",
  recraftv4_pro: "Recraft V4 Pro",
  recraftv4_pro_vector: "Recraft V4 Pro (vector)",
  recraftv3: "Recraft V3",
  recraftv3_vector: "Recraft V3 (vector)",
  recraftv2: "Recraft V2",
  recraftv2_vector: "Recraft V2 (vector)",
};

// Descriptions sourced from Recraft API docs (api-reference). Verbatim or
// close paraphrase of the docs — no claims made beyond what is documented.
const MODEL_DESCRIPTIONS: Record<RecraftModel, string> = {
  recraftv4:
    "V4 delivers true design vision in composition, lighting, textures, and overall feel. 1MP — for everyday work and fast iteration.",
  recraftv4_vector:
    "V4 with production-grade vector generation. 1MP, for everyday work and fast iteration.",
  recraftv4_pro:
    "V4 design quality at 4MP — print-ready assets and large-scale use. Same creative capabilities as V4.",
  recraftv4_pro_vector:
    "V4 Pro with production-grade vector generation. 4MP — for print-ready vector assets.",
  recraftv3:
    "Major advances in photorealism and text rendering. Ranked first on the Hugging Face Text-to-Image leaderboard for five consecutive months.",
  recraftv3_vector:
    "V3 with vector output. Same V3 capabilities (photorealism, text rendering) in vector form.",
  recraftv2:
    "Raster and vector images with anatomical accuracy, consistent brand styling, and precise iteration control.",
  recraftv2_vector:
    "V2 with vector output. Same V2 capabilities (anatomy, brand consistency, iteration control) in vector form.",
};

// Vector model variants always emit SVG.
const VECTOR_MODELS = new Set<RecraftModel>([
  "recraftv4_vector",
  "recraftv4_pro_vector",
  "recraftv3_vector",
  "recraftv2_vector",
]);

// `style` is a V2/V3 (raster) param. V4 family uses style_id (out of scope).
// Vector model variants don't take `style` either — output is implicitly SVG.
const STYLE_MODELS = new Set<RecraftModel>(["recraftv2", "recraftv3"]);

const STYLES_BY_MODEL: Partial<Record<RecraftModel, string[]>> = {
  recraftv2: ["realistic_image", "digital_illustration", "vector_illustration", "icon"],
  recraftv3: ["realistic_image", "digital_illustration", "vector_illustration"],
};

const STYLE_LABELS: Record<string, string> = {
  realistic_image: "Realistic",
  digital_illustration: "Digital illustration",
  vector_illustration: "Vector illustration (SVG)",
  icon: "Icon",
};

// `negative_prompt` is documented as V2/V3 only. V4 family does not support it.
const NEGATIVE_PROMPT_MODELS: RecraftModel[] = [
  "recraftv2",
  "recraftv2_vector",
  "recraftv3",
  "recraftv3_vector",
];

// Per Recraft docs (api-reference/appendix#maximum-prompt-length):
// V2/V3 family caps prompts at 1000 chars; V4 family caps at 10000.
const MAX_PROMPT_LENGTH: Record<RecraftModel, number> = {
  recraftv2: 1000,
  recraftv2_vector: 1000,
  recraftv3: 1000,
  recraftv3_vector: 1000,
  recraftv4: 10_000,
  recraftv4_vector: 10_000,
  recraftv4_pro: 10_000,
  recraftv4_pro_vector: 10_000,
};

// Cross-model aspect ratios per the appendix.
const SIZES = [
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "2:1",
  "1:2",
] as const;
type RecraftSize = (typeof SIZES)[number];

const DEFAULT_MODEL: RecraftModel = "recraftv3";
const DEFAULT_SIZE: RecraftSize = "1:1";

const styleChoicesByModel: Record<string, ProviderOptionChoice[]> =
  Object.fromEntries(
    Array.from(STYLE_MODELS).map((m) => [
      m,
      (STYLES_BY_MODEL[m] ?? []).map<ProviderOptionChoice>((s) => ({
        value: s,
        label: STYLE_LABELS[s] ?? s,
      })),
    ]),
  );

const defaultStyleByModel: Record<string, string> = Object.fromEntries(
  Array.from(STYLE_MODELS).map((m) => [m, (STYLES_BY_MODEL[m] ?? [""])[0]]),
);

// We keep the response loosely typed so we can persist *every* field Recraft
// returns, including ones not yet in their public docs (request IDs, billing
// hints, etc.). Only the fields we actually consume are typed strictly.
type RecraftResponse = {
  created?: number;
  credits?: number;
  data?: Array<{ url?: string; b64_json?: string; [k: string]: unknown }>;
  [k: string]: unknown;
};

export class RecraftProvider implements ImageProvider {
  readonly id: ProviderId = "recraft";
  readonly displayName = "Recraft";

  readonly outputFormat: OutputFormatHint = {
    rules: [
      ...Array.from(VECTOR_MODELS).map((m) => ({
        optionId: "model",
        valueIs: m,
        label: "SVG (vector, .svg)",
      })),
      {
        optionId: "style",
        valueIs: "vector_illustration",
        label: "SVG (vector, .svg)",
      },
    ],
    defaultLabel: "Raster image (WebP, .webp)",
  };

  readonly optionFields: ProviderOptionField[] = [
    {
      id: "model",
      label: "Model",
      defaultValue: DEFAULT_MODEL,
      choices: (MODELS as readonly RecraftModel[]).map((m) => ({
        value: m,
        label: MODEL_LABELS[m],
        description: MODEL_DESCRIPTIONS[m],
      })),
    },
    {
      id: "style",
      label: "Style",
      defaultValue: defaultStyleByModel[DEFAULT_MODEL] ?? "realistic_image",
      dependsOn: "model",
      choicesByValue: styleChoicesByModel,
      defaultsByValue: defaultStyleByModel,
      visibleWhenParentIn: Array.from(STYLE_MODELS),
    },
    {
      id: "size",
      label: "Aspect ratio",
      defaultValue: DEFAULT_SIZE,
      choices: (SIZES as readonly RecraftSize[]).map((s) => ({
        value: s,
        label: s,
      })),
    },
    {
      id: "output_format",
      label: "Output format",
      defaultValue: "original",
      choices: [
        { value: "original", label: "Original (model-decided)" },
        { value: "webp", label: "WebP (.webp)" },
        { value: "png", label: "PNG (.png)" },
        { value: "jpg", label: "JPEG (.jpg)" },
      ],
      hideForVectorOutput: true,
    },
    {
      id: "negative_prompt",
      label: "Negative prompt (optional)",
      defaultValue: "",
      type: "text",
      placeholder: "things to avoid in the image",
      maxLength: 1000,
      dependsOn: "model",
      visibleWhenParentIn: NEGATIVE_PROMPT_MODELS,
    },
  ];

  constructor(private readonly apiKey: string) {}

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const model = pickFromList(input.options?.model, MODELS, DEFAULT_MODEL);
    const size = pickFromList(input.options?.size, SIZES, DEFAULT_SIZE);

    const maxPrompt = MAX_PROMPT_LENGTH[model];
    if (input.prompt.length > maxPrompt) {
      throw new ProviderError({
        kind: "invalid_request",
        providerId: this.id,
        message: `Prompt exceeds Recraft ${MODEL_LABELS[model]} limit of ${maxPrompt} characters (got ${input.prompt.length}).`,
      });
    }

    const body: Record<string, unknown> = {
      prompt: input.prompt,
      model,
      size,
      response_format: "b64_json",
    };

    let style: string | undefined;
    if (STYLE_MODELS.has(model)) {
      const allowed = STYLES_BY_MODEL[model] ?? [];
      style = pickFromList(
        input.options?.style,
        allowed,
        defaultStyleByModel[model] ?? allowed[0],
      );
      if (style) body.style = style;
    }

    let negativePrompt: string | undefined;
    if (NEGATIVE_PROMPT_MODELS.includes(model)) {
      const np = input.options?.negative_prompt?.trim();
      if (np) {
        negativePrompt = np.slice(0, 1000);
        body.negative_prompt = negativePrompt;
      }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(RECRAFT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        throw new ProviderError({
          kind: "timeout",
          providerId: this.id,
          message: "Recraft timeout",
        });
      }
      throw new ProviderError({
        kind: "upstream",
        providerId: this.id,
        message: "Recraft network error",
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
        message: `Recraft ${res.status}`,
        upstream: errBody,
      });
    }

    const json = (await res.json()) as RecraftResponse;
    const first = json.data?.[0];
    if (!first?.b64_json) {
      throw new ProviderError({
        kind: "upstream",
        providerId: this.id,
        message: "Recraft returned no image data",
        upstream: json,
      });
    }

    const imageBytes = Buffer.from(first.b64_json, "base64");
    const mimeType = sniffImageMime(imageBytes) ?? "image/png";
    const credits = json.credits ?? 0;

    // Persist the entire upstream response for debugging / auditing — but
    // strip the raw image bytes (we already have those on disk). This keeps
    // every documented and undocumented field Recraft sends.
    const safeRaw = stripImageBytes(json);

    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: credits,
      totalTokens: credits,
      raw: safeRaw,
    };

    const metadata: Record<string, unknown> = {
      source: "recraft.v1",
      model,
      size,
    };
    if (style) metadata.style = style;
    if (negativePrompt) metadata.negative_prompt = negativePrompt;

    return {
      imageBytes,
      mimeType,
      usage,
      providerMetadata: metadata,
    };
  }

  async fetchBalance(): Promise<ProviderBalance> {
    let res: Response;
    try {
      res = await fetch(RECRAFT_USER_ENDPOINT, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new ProviderError({
        kind: "upstream",
        providerId: this.id,
        message: "Recraft balance request failed",
        upstream: err instanceof Error ? err.message : String(err),
      });
    }
    if (!res.ok) {
      throw new ProviderError({
        kind: classifyHttpError(res.status),
        providerId: this.id,
        message: `Recraft ${res.status}`,
        upstream: await safeText(res),
      });
    }
    const json = (await res.json()) as { credits?: number };
    return { credits: json.credits ?? 0, raw: json };
  }
}

function stripImageBytes(json: RecraftResponse): Record<string, unknown> {
  const cloned: Record<string, unknown> = { ...json };
  if (Array.isArray(json.data)) {
    cloned.data = json.data.map((d) => {
      const { b64_json, ...rest } = d;
      return {
        ...rest,
        b64_json: b64_json
          ? `[base64 stripped, ${b64_json.length} chars]`
          : undefined,
      };
    });
  }
  return cloned;
}

function pickFromList<T extends string>(
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
