import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GeminiImageEditProvider,
  RETRY_ATTEMPTS,
  stripHeavyFields,
} from "@/lib/providers/gemini-image-edit";
import { ProviderError } from "@/lib/providers/errors";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SOURCE = { bytes: Buffer.from("source-bytes"), mimeType: "image/png" };
const RESULT_B64 = PNG_MAGIC.toString("base64");

function okResponse(extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { thoughtSignature: "t".repeat(180_000) },
              { inlineData: { mimeType: "image/png", data: RESULT_B64 } },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 1290, totalTokenCount: 1590 },
      ...extra,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1)!;
  return JSON.parse((call[1] as RequestInit).body as string);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GeminiImageEditProvider request shape (glyph parity)", () => {
  it("sends the image as the FIRST part and the prompt second, IMAGE-only, 1:1, 1K, no thinking", async () => {
    fetchMock.mockImplementation(async () => okResponse());
    const provider = new GeminiImageEditProvider("k", SOURCE);
    await provider.generate({ prompt: "make it blue" });

    const body = lastBody(fetchMock) as {
      contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
      generationConfig: Record<string, unknown>;
    };
    const parts = body.contents[0].parts;
    expect(body.contents[0].role).toBe("user");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({
      inlineData: { mimeType: "image/png", data: SOURCE.bytes.toString("base64") },
    });
    expect(parts[1]).toEqual({ text: "make it blue" });
    expect(body.generationConfig).toEqual({
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
    });
    expect(body.generationConfig).not.toHaveProperty("thinkingConfig");
    expect(body).not.toHaveProperty("system_instruction");
  });

  it("targets glyph's GA model by default and the selected model when given", async () => {
    fetchMock.mockImplementation(async () => okResponse());
    await new GeminiImageEditProvider("k", SOURCE).generate({ prompt: "p" });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/models/gemini-3.1-flash-image:generateContent",
    );

    await new GeminiImageEditProvider("k", SOURCE, {
      model: "gemini-3-pro-image-preview",
    }).generate({ prompt: "p" });
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/models/gemini-3-pro-image-preview:generateContent",
    );
  });

  it("omits imageSize for gemini-2.5-flash-image and honours overrides elsewhere", async () => {
    fetchMock.mockImplementation(async () => okResponse());
    await new GeminiImageEditProvider("k", SOURCE, {
      model: "gemini-2.5-flash-image",
      imageSize: "2K",
      aspectRatio: "16:9",
    }).generate({ prompt: "p" });
    let cfg = lastBody(fetchMock).generationConfig as { imageConfig: Record<string, unknown> };
    expect(cfg.imageConfig).toEqual({ aspectRatio: "16:9" });

    await new GeminiImageEditProvider("k", SOURCE, { imageSize: "2K" }).generate({ prompt: "p" });
    cfg = lastBody(fetchMock).generationConfig as { imageConfig: Record<string, unknown> };
    expect(cfg.imageConfig).toEqual({ aspectRatio: "1:1", imageSize: "2K" });
  });

  it("decodes the image, maps usage and strips heavy fields from usage.raw", async () => {
    fetchMock.mockImplementation(async () => okResponse());
    const out = await new GeminiImageEditProvider("k", SOURCE).generate({ prompt: "p" });

    expect(out.imageBytes.equals(PNG_MAGIC)).toBe(true);
    expect(out.mimeType).toBe("image/png");
    expect(out.usage).toMatchObject({ inputTokens: 300, outputTokens: 1290, totalTokens: 1590 });
    const rawJson = JSON.stringify(out.usage.raw);
    expect(rawJson.length).toBeLessThan(5_000);
    expect(rawJson).toContain("[stripped, 180000 chars]");
    expect(rawJson).toContain("[base64 stripped,");
    expect(out.providerMetadata).toMatchObject({
      source: "gemini-image-edit",
      model: "gemini-3.1-flash-image",
      aspectRatio: "1:1",
      imageSize: "1K",
      edit: true,
      finishReason: "STOP",
    });
  });

  it("keeps the shared provider id and exposes no option form", () => {
    const provider = new GeminiImageEditProvider("k", SOURCE);
    expect(provider.id).toBe("gemini-nano-banana-2");
    expect(provider.optionFields).toEqual([]);
  });
});

describe("GeminiImageEditProvider failure classification", () => {
  async function kindFor(status: number) {
    fetchMock.mockResolvedValue(new Response("nope", { status }));
    const p = new GeminiImageEditProvider("k", SOURCE).generate({ prompt: "p" });
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    return (err as ProviderError).kind;
  }

  it("maps 401/403 to auth, 429 to rate_limit, 400 to invalid_request, 500 to upstream", async () => {
    expect(await kindFor(401)).toBe("auth");
    expect(await kindFor(403)).toBe("auth");
    expect(await kindFor(429)).toBe("rate_limit");
    expect(await kindFor(400)).toBe("invalid_request");
    expect(await kindFor(500)).toBe("upstream");
  });

  it("retries a 503 up to RETRY_ATTEMPTS times, then reports rate_limit", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response("busy", { status: 503 }));
    const p = new GeminiImageEditProvider("k", SOURCE).generate({ prompt: "p" });
    const settled = p.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await settled;
    expect(fetchMock).toHaveBeenCalledTimes(RETRY_ATTEMPTS);
    expect((err as ProviderError).kind).toBe("rate_limit");
  });

  it("maps an aborted fetch to timeout without retrying", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValue(abort);
    const err = await new GeminiImageEditProvider("k", SOURCE)
      .generate({ prompt: "p" })
      .catch((e) => e);
    expect((err as ProviderError).kind).toBe("timeout");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports upstream with a stripped body when no image part comes back", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "no" }] } }],
        }),
        { status: 200 },
      ),
    );
    const err = await new GeminiImageEditProvider("k", SOURCE)
      .generate({ prompt: "p" })
      .catch((e) => e);
    expect((err as ProviderError).kind).toBe("upstream");
    expect((err as ProviderError).upstream).toMatchObject({
      candidates: [{ finishReason: "SAFETY" }],
    });
  });
});

describe("stripHeavyFields", () => {
  it("replaces base64 and thought signatures but keeps the rest", () => {
    const out = stripHeavyFields({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { inlineData: { mimeType: "image/png", data: "abcd" }, thoughtSignature: "xyz" },
            ],
          },
        },
      ],
      usageMetadata: { totalTokenCount: 3 },
    });
    expect(out).toEqual({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                inlineData: { mimeType: "image/png", data: "[base64 stripped, 4 chars]" },
                thoughtSignature: "[stripped, 3 chars]",
              },
            ],
          },
        },
      ],
      usageMetadata: { totalTokenCount: 3 },
    });
  });
});
