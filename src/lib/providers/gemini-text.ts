import "server-only";
import { env } from "@/lib/env";
import { ProviderError } from "@/lib/providers/errors";

const MODEL_ID = "gemini-3.1-flash-preview";
const REQUEST_TIMEOUT_MS = 600_000;

function endpoint(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

type GenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  promptFeedback?: { blockReason?: string };
};

export async function generateText({
  systemPrompt,
  userPrompt,
}: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(endpoint(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ProviderError({ kind: "timeout", providerId: "gemini-text", message: "Gemini request timed out" });
    }
    throw new ProviderError({ kind: "upstream", providerId: "gemini-text", message: "Gemini request failed" });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError({ kind: "auth", providerId: "gemini-text", message: "Gemini auth failed" });
    }
    if (res.status === 429) {
      throw new ProviderError({ kind: "rate_limit", providerId: "gemini-text", message: "Gemini rate limited" });
    }
    if (res.status >= 400 && res.status < 500) {
      throw new ProviderError({ kind: "invalid_request", providerId: "gemini-text", message: `Gemini rejected request (${res.status})` });
    }
    throw new ProviderError({ kind: "upstream", providerId: "gemini-text", message: `Gemini upstream error (${res.status})` });
  }

  const body = (await res.json()) as GenerateContentResponse;
  if (body.promptFeedback?.blockReason) {
    throw new ProviderError({
      kind: "invalid_request",
      providerId: "gemini-text",
      message: `Blocked: ${body.promptFeedback.blockReason}`,
    });
  }

  const text = body.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new ProviderError({ kind: "upstream", providerId: "gemini-text", message: "Gemini returned no text" });
  }
  return text;
}
