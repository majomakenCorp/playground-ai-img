import "server-only";
import { env } from "@/lib/env";
import { GeminiProvider } from "@/lib/providers/gemini";
import { RecraftProvider } from "@/lib/providers/recraft";
import type {
  ImageProvider,
  OutputFormatHint,
  ProviderId,
  ProviderOptionField,
} from "@/lib/providers/types";

let cache: Record<ProviderId, ImageProvider> | null = null;

function build(): Record<ProviderId, ImageProvider> {
  if (cache) return cache;
  cache = {
    "gemini-nano-banana-2": new GeminiProvider(env.GEMINI_API_KEY),
    recraft: new RecraftProvider(env.RECRAFT_API_KEY),
  };
  return cache;
}

export function getProvider(id: string): ImageProvider | null {
  return (build() as Record<string, ImageProvider>)[id] ?? null;
}

export interface ProviderListEntry {
  id: ProviderId;
  displayName: string;
  optionFields: ProviderOptionField[];
  outputFormat: OutputFormatHint;
}

export function listProviders(): ProviderListEntry[] {
  return (Object.values(build()) as ImageProvider[]).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    optionFields: p.optionFields,
    outputFormat: p.outputFormat,
  }));
}
