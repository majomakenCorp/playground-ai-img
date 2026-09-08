import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/lib/auth/origin", () => ({ isAllowedOrigin: vi.fn(() => true) }));
vi.mock("@/lib/auth/session", () => ({ readSession: vi.fn() }));
vi.mock("@/lib/providers/gemini-image-edit", () => ({
  createGeminiImageEditProvider: vi.fn(),
}));
vi.mock("@/lib/storage/images", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/images")>();
  return { ...actual, writeImage: vi.fn() };
});
vi.mock("@/lib/storage/history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/history")>();
  return { ...actual, insertHistory: vi.fn() };
});

import { POST } from "@/app/api/edit/route";
import * as session from "@/lib/auth/session";
import * as origin from "@/lib/auth/origin";
import * as editProvider from "@/lib/providers/gemini-image-edit";
import * as images from "@/lib/storage/images";
import * as historyRepo from "@/lib/storage/history";
import { ProviderError } from "@/lib/providers/errors";
import { MAX_UPLOAD_BYTES } from "@/lib/logo-edit/ingest";

const PNG_RESULT = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0]);

async function logoPng() {
  return sharp({
    create: { width: 6, height: 6, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
}

function multipart(fields: Record<string, string>, file?: { bytes: Buffer; name?: string; type?: string }) {
  const fd = new FormData();
  if (file) {
    fd.append(
      "image",
      new File([new Uint8Array(file.bytes)], file.name ?? "logo.png", {
        type: file.type ?? "image/png",
      }),
    );
  }
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request("http://localhost/api/edit", { method: "POST", body: fd });
}

const generate = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(origin.isAllowedOrigin).mockReturnValue(true);
  vi.mocked(session.readSession).mockResolvedValue({ sub: "shared", iat: 0, exp: 0 } as never);
  generate.mockResolvedValue({
    imageBytes: PNG_RESULT,
    mimeType: "image/png",
    usage: { inputTokens: 300, outputTokens: 1290, totalTokens: 1590, raw: { ok: true } },
    providerMetadata: { source: "gemini-image-edit", model: "gemini-3.1-flash-image", edit: true },
  });
  vi.mocked(editProvider.createGeminiImageEditProvider).mockReturnValue({
    id: "gemini-nano-banana-2",
    displayName: "edit",
    optionFields: [],
    outputFormat: { rules: [], defaultLabel: "png" },
    generate,
  });
  vi.mocked(images.writeImage).mockImplementation(async (a) =>
    a.variant ? `${a.id}.${a.variant}.${a.ext}` : `${a.id}.${a.ext}`,
  );
  vi.mocked(historyRepo.insertHistory).mockImplementation(async (input) => ({
    ...input,
    providerMetadata: input.providerMetadata ?? null,
    variants: input.variants ?? null,
    parentId: null,
    parentRole: null,
    quadrantIndex: null,
    childIds: null,
    createdAt: "2026-09-08T00:00:00.000Z",
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/edit guards", () => {
  it("returns 401 without a session", async () => {
    vi.mocked(session.readSession).mockResolvedValue(null);
    const res = await POST(multipart({ prompt: "p" }, { bytes: await logoPng() }));
    expect(res.status).toBe(401);
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 403 when the origin check fails", async () => {
    vi.mocked(origin.isAllowedOrigin).mockReturnValue(false);
    const res = await POST(multipart({ prompt: "p" }, { bytes: await logoPng() }));
    expect(res.status).toBe(403);
  });

  it("returns 400 invalid_form_data for a JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "p" }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_form_data");
  });

  it("returns 400 missing_image when no file is attached", async () => {
    const res = await POST(multipart({ prompt: "p" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_image");
  });

  it("returns 400 invalid_request on an empty prompt and on an unknown model", async () => {
    let res = await POST(multipart({ prompt: "   " }, { bytes: await logoPng() }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");

    res = await POST(multipart({ prompt: "p", model: "dall-e" }, { bytes: await logoPng() }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 415 for an SVG upload even with an image/png content type", async () => {
    const res = await POST(
      multipart({ prompt: "p" }, { bytes: Buffer.from("<svg></svg>"), type: "image/png" }),
    );
    expect(res.status).toBe(415);
    expect((await res.json()).error).toBe("unsupported_image_type");
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns 413 when the declared body length exceeds the cap", async () => {
    const req = new Request("http://localhost/api/edit", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=x",
        "Content-Length": String(MAX_UPLOAD_BYTES * 3),
      },
      body: "--x--",
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("file_too_large");
  });
});

describe("POST /api/edit happy path", () => {
  it("normalizes the upload, edits it, stores result + source under one id and records history", async () => {
    const res = await POST(
      multipart(
        { prompt: "make it blue", model: "gemini-3-pro-image-preview", image_size: "2K" },
        { bytes: await sharp(await logoPng()).webp().toBuffer(), name: "logo.webp", type: "image/webp" },
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    const factoryCall = vi.mocked(editProvider.createGeminiImageEditProvider).mock.calls[0];
    expect(factoryCall[0].mimeType).toBe("image/png");
    expect((await sharp(factoryCall[0].bytes).metadata()).format).toBe("png");
    expect(factoryCall[1]).toEqual({
      model: "gemini-3-pro-image-preview",
      aspectRatio: undefined,
      imageSize: "2K",
    });
    expect(generate).toHaveBeenCalledWith({ prompt: "make it blue" });

    const writes = vi.mocked(images.writeImage).mock.calls.map((c) => c[0]);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ ext: "png" });
    expect(writes[0]).not.toHaveProperty("variant");
    expect(writes[1]).toMatchObject({ ext: "png", variant: "source" });
    expect(writes[1].id).toBe(writes[0].id);

    const inserted = vi.mocked(historyRepo.insertHistory).mock.calls[0][0];
    expect(inserted.id).toBe(writes[0].id);
    expect(inserted.providerId).toBe("gemini-nano-banana-2");
    expect(inserted.variants?.source?.filename).toBe(`${writes[0].id}.source.png`);
    expect(inserted.providerMetadata).toMatchObject({ edit: true, sourceWidth: 6, sourceHeight: 6 });

    expect(body.id).toBe(writes[0].id);
    expect(body.imageUrl).toBe(`/api/images/${writes[0].id}`);
    expect(body.sourceImageUrl).toBe(`/api/images/${writes[0].id}?variant=source`);
    expect(body.mimeType).toBe("image/png");
    expect(body.usage).toMatchObject({ inputTokens: 300, outputTokens: 1290, totalTokens: 1590 });
    expect(typeof body.durationMs).toBe("number");
    expect(body.providerMetadata.edit).toBe(true);
  });
});

describe("POST /api/edit output normalization", () => {
  it("re-encodes a JPEG answer to PNG before storing (glyph parity)", async () => {
    const jpeg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .jpeg()
      .toBuffer();
    generate.mockResolvedValueOnce({
      imageBytes: jpeg,
      mimeType: "image/png", // provider lies; bytes are JPEG
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, raw: {} },
      providerMetadata: { edit: true },
    });

    const res = await POST(multipart({ prompt: "p" }, { bytes: await logoPng() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mimeType).toBe("image/png");

    const resultWrite = vi.mocked(images.writeImage).mock.calls[0][0];
    expect(resultWrite.ext).toBe("png");
    expect((await sharp(resultWrite.bytes).metadata()).format).toBe("png");
  });
});

describe("POST /api/edit failures after validation", () => {
  it("maps a provider rate_limit to 429 provider_rate_limit and writes nothing", async () => {
    generate.mockRejectedValue(
      new ProviderError({ kind: "rate_limit", providerId: "gemini-nano-banana-2", message: "busy" }),
    );
    const res = await POST(multipart({ prompt: "p" }, { bytes: await logoPng() }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("provider_rate_limit");
    expect(images.writeImage).not.toHaveBeenCalled();
    expect(historyRepo.insertHistory).not.toHaveBeenCalled();
  });

  it("returns 500 storage_failed when a write throws and skips history", async () => {
    vi.mocked(images.writeImage).mockRejectedValue(new Error("r2 down"));
    const res = await POST(multipart({ prompt: "p" }, { bytes: await logoPng() }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("storage_failed");
    expect(historyRepo.insertHistory).not.toHaveBeenCalled();
  });

  it("returns 503 history_failed when the insert throws", async () => {
    vi.mocked(historyRepo.insertHistory).mockRejectedValue(new Error("mongo down"));
    const res = await POST(multipart({ prompt: "p" }, { bytes: await logoPng() }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("history_failed");
  });
});
