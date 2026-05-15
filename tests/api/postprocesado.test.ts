import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/history", () => ({
  findPostprocesado: vi.fn(),
}));

import { GET } from "@/app/api/postprocesado/route";
import * as historyRepo from "@/lib/storage/history";

function makeReq(qs = "") {
  return new Request(`http://localhost/api/postprocesado${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/postprocesado", () => {
  it("returns groups with parent + quadrants in deterministic shape", async () => {
    const parent = {
      id: "0193b4c2-1234-7abc-8def-000000000001",
      providerId: "recraft",
      prompt: "p",
      imageFilename: "p.png",
      mimeType: "image/png",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      rawUsage: null,
      providerMetadata: null,
      variants: null,
      parentId: null,
      parentRole: null,
      quadrantIndex: null,
      childIds: ["c0", "c1", "c2", "c3"],
      durationMs: 0,
      createdAt: "2026-05-07T12:00:00.000Z",
    };
    const quadrants = [0, 1, 2, 3].map((i) => ({
      ...parent,
      id: `c${i}`,
      parentId: parent.id,
      parentRole: "quadrant" as const,
      quadrantIndex: i,
      childIds: null,
      variants: i === 1 ? { vector: { filename: "c1.vector.svg", mimeType: "image/svg+xml", createdAt: "x" } } : null,
    }));
    vi.mocked(historyRepo.findPostprocesado).mockResolvedValue([
      { parent, quadrants },
    ]);

    const res = await GET(makeReq("?limit=10"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].parent.imageUrl).toBe(`/api/images/${parent.id}`);
    expect(body.items[0].quadrants).toHaveLength(4);
    expect(body.items[0].quadrants[1].vectorVariant.filename).toBe(
      "c1.vector.svg",
    );
    expect(body.items[0].quadrants[0].vectorVariant).toBeNull();
  });

  it("rejects an invalid limit with 400", async () => {
    const res = await GET(makeReq("?limit=banana"));
    expect(res.status).toBe(400);
  });

  it("returns 503 when the storage layer throws", async () => {
    vi.mocked(historyRepo.findPostprocesado).mockRejectedValueOnce(
      new Error("mongo down"),
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(503);
  });
});
