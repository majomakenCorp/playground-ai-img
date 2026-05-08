import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/origin", () => ({
  isAllowedOrigin: vi.fn(() => true),
}));

vi.mock("@/lib/storage/history", () => ({
  getHistory: vi.fn(),
  setVariant: vi.fn(),
}));

vi.mock("@/lib/storage/images", () => ({
  readImageBytes: vi.fn(),
  writeImage: vi.fn(),
}));

vi.mock("@/lib/postprocess/vectorize", () => ({
  vectorize: vi.fn(),
}));

import { POST } from "@/app/api/history/[id]/vectorize/route";
import * as historyRepo from "@/lib/storage/history";
import * as images from "@/lib/storage/images";
import * as v from "@/lib/postprocess/vectorize";
import * as origin from "@/lib/auth/origin";

const VALID_ID = "0193b4c2-1234-7abc-8def-000000000001";
const QUADRANT_RECORD = {
  id: VALID_ID,
  providerId: "recraft",
  prompt: "p",
  imageFilename: `${VALID_ID}.png`,
  mimeType: "image/png",
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  rawUsage: null,
  providerMetadata: null,
  variants: null,
  parentId: "0193b4c2-1234-7abc-8def-000000000099",
  parentRole: "quadrant" as const,
  quadrantIndex: 0,
  childIds: null,
  createdAt: new Date().toISOString(),
};

function makeReq(body?: unknown) {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request("http://localhost/api/history/abc/vectorize", init);
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(origin.isAllowedOrigin).mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/history/[id]/vectorize", () => {
  it("rejects an invalid UUID with 400", async () => {
    const res = await POST(makeReq(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the record does not exist", async () => {
    vi.mocked(historyRepo.getHistory).mockResolvedValue(null);
    const res = await POST(makeReq(), ctx(VALID_ID));
    expect(res.status).toBe(404);
  });

  it("rejects vectorizing an SVG with 422", async () => {
    vi.mocked(historyRepo.getHistory).mockResolvedValue({
      ...QUADRANT_RECORD,
      mimeType: "image/svg+xml",
    });
    const res = await POST(makeReq(), ctx(VALID_ID));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("unsupported_mime");
  });

  it("returns existing variant with reused:true (idempotent)", async () => {
    const existingVariant = {
      filename: `${VALID_ID}.vector.svg`,
      mimeType: "image/svg+xml",
      createdAt: new Date().toISOString(),
    };
    vi.mocked(historyRepo.getHistory).mockResolvedValue({
      ...QUADRANT_RECORD,
      variants: { vector: existingVariant },
    });

    const res = await POST(makeReq(), ctx(VALID_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reused).toBe(true);
    expect(body.variant).toEqual(existingVariant);
    expect(v.vectorize).not.toHaveBeenCalled();
    expect(images.writeImage).not.toHaveBeenCalled();
  });

  it("happy path: traces, writes svg, sets variant", async () => {
    vi.mocked(historyRepo.getHistory).mockResolvedValue(QUADRANT_RECORD);
    vi.mocked(images.readImageBytes).mockResolvedValue(Buffer.from("png"));
    vi.mocked(v.vectorize).mockResolvedValue({
      svg: "<svg></svg>",
      bytes: Buffer.from("<svg></svg>"),
      mime: "image/svg+xml",
    });
    vi.mocked(images.writeImage).mockResolvedValue(`${VALID_ID}.vector.svg`);

    const res = await POST(makeReq({ mode: "mono" }), ctx(VALID_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reused).toBe(false);
    expect(body.variant.mimeType).toBe("image/svg+xml");
    expect(body.variant.filename).toBe(`${VALID_ID}.vector.svg`);
    expect(historyRepo.setVariant).toHaveBeenCalledTimes(1);
    const setCall = vi.mocked(historyRepo.setVariant).mock.calls[0];
    expect(setCall[0]).toBe(VALID_ID);
    expect(setCall[1]).toBe("vector");
  });

  it("returns 500 vectorize_failed when potrace throws", async () => {
    vi.mocked(historyRepo.getHistory).mockResolvedValue(QUADRANT_RECORD);
    vi.mocked(images.readImageBytes).mockResolvedValue(Buffer.from("png"));
    vi.mocked(v.vectorize).mockRejectedValueOnce(new Error("trace failed"));

    const res = await POST(makeReq(), ctx(VALID_ID));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("vectorize_failed");
    expect(historyRepo.setVariant).not.toHaveBeenCalled();
  });

  it("rejects an invalid mode with 400 invalid_request", async () => {
    const res = await POST(makeReq({ mode: "rainbow" }), ctx(VALID_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });
});
