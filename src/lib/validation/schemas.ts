import { z } from "zod";

export const LoginSchema = z.object({
  password: z.string().min(1).max(512),
});
export type LoginInput = z.infer<typeof LoginSchema>;

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const UuidV7Schema = z.string().regex(UUID_V7_REGEX, "invalid id");

export const GenerateSchema = z.object({
  providerId: z.string().min(1),
  // Recraft caps at 4000; Gemini accepts up to ~32 k. The per-provider check
  // lives in the route handler so we use the higher ceiling here.
  prompt: z.string().min(1).max(32000),
  options: z.record(z.string(), z.string().max(128)).optional(),
  systemPromptId: UuidV7Schema.optional(),
});
export type GenerateInput = z.infer<typeof GenerateSchema>;

export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  before: z.string().datetime().optional(),
});

export const VectorizeOptionsSchema = z.object({
  mode: z.enum(["mono"]).default("mono"),
});
export type VectorizeOptionsInput = z.infer<typeof VectorizeOptionsSchema>;

export const PostprocesadoQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  before: z.string().datetime().optional(),
});

const trimmed = (max: number) => z.string().trim().max(max);

export const BrandBriefFormSchema = z.object({
  basics: z.object({
    brandName: trimmed(120).min(1),
    sector: trimmed(80).min(1),
    projectType: z.enum(["new", "redesign", "extension"]),
  }),
  core: z.object({
    purpose: trimmed(140),
    promise: trimmed(140),
  }),
  feel: z.object({
    seriousPlayful: z.number().int().min(0).max(100),
    warmClinical: z.number().int().min(0).max(100),
    traditionalAvantgarde: z.number().int().min(0).max(100),
    understatedExpressive: z.number().int().min(0).max(100),
    refinedRaw: z.number().int().min(0).max(100),
  }),
  character: z.object({
    primaryArchetype: trimmed(40).min(1),
    secondaryArchetype: trimmed(40).nullable(),
  }),
  audience: z.object({
    ageMin: z.number().int().min(16).max(99),
    ageMax: z.number().int().min(16).max(99),
    drivers: z.array(trimmed(80)).max(12),
    lifeMoment: trimmed(200),
  }),
  voice: z.object({
    tonePositive: trimmed(60).min(1),
    toneNegative: trimmed(60).min(1),
  }),
  visual: z.object({
    aesthetics: z.array(trimmed(60)).max(3),
    palette: trimmed(60).min(1),
    typography: trimmed(120).min(1),
  }),
  exclusions: z.object({
    cliches: z.array(trimmed(80)).max(20),
    admire: z.array(trimmed(120)).max(3),
    differentiate: z.array(trimmed(120)).max(3),
  }),
});
export type BrandBriefForm = z.infer<typeof BrandBriefFormSchema>;

export const CreateBrandBriefSchema = z.object({
  formData: BrandBriefFormSchema,
});

export const SystemPromptInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(20000),
});
export type SystemPromptInput = z.infer<typeof SystemPromptInputSchema>;

export const SystemPromptPatchSchema = SystemPromptInputSchema.partial();

export const GenerateBriefSchema = z.object({
  systemPromptId: UuidV7Schema,
});

export const PromptLabProviderId = z.enum(["gemini-text", "claude-cli"]);
export type PromptLabProviderIdType = z.infer<typeof PromptLabProviderId>;

export const PromptLabGenerateSchema = z.object({
  providerId: PromptLabProviderId,
  prompt: z.string().trim().min(1).max(32000),
});
export type PromptLabGenerateInput = z.infer<typeof PromptLabGenerateSchema>;

export const PromptLabHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  before: z.string().datetime().optional(),
});
