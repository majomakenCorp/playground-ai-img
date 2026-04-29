import "server-only";
import { z } from "zod";

const EnvSchema = z.object({
  APP_PASSWORD: z.string().min(1, "APP_PASSWORD is required"),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters"),
  APP_ORIGIN: z.string().url("APP_ORIGIN must be a valid URL").optional(),

  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  RECRAFT_API_KEY: z.string().min(1, "RECRAFT_API_KEY is required"),

  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .refine(
      (s) => s.startsWith("mongodb://") || s.startsWith("mongodb+srv://"),
      "MONGODB_URI must start with mongodb:// or mongodb+srv://",
    ),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  IMAGES_DIR: z.string().default("./generate-images"),

  R2_ENDPOINT: z.string().url().optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n` +
        `See .env.example for the full list of required variables.`,
    );
  }
  cached = Object.freeze(parsed.data);
  return cached;
}

export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
  has(_target, prop: string) {
    return prop in loadEnv();
  },
  ownKeys() {
    return Object.keys(loadEnv());
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    return Object.getOwnPropertyDescriptor(loadEnv(), prop);
  },
});
