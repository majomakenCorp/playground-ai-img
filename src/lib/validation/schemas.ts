import { z } from "zod";

export const LoginSchema = z.object({
  password: z.string().min(1).max(512),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const GenerateSchema = z.object({
  providerId: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  options: z.record(z.string(), z.string().max(128)).optional(),
});
export type GenerateInput = z.infer<typeof GenerateSchema>;

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const UuidV7Schema = z.string().regex(UUID_V7_REGEX, "invalid id");

export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  before: z.string().datetime().optional(),
});
