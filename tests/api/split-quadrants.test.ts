import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/origin", () => ({
  isAllowedOrigin: vi.fn(() => true),
}));

vi.mock("@/lib/storage/history", () => ({
  getHistory: vi.fn(),
  findChildren: vi.fn(),
  insertHistory: vi.fn(),
  setChildIds: vi.fn(),
}));

vi.mock("@/lib/storage/images", () => ({
  readImageBytes: vi.fn(),
  writeImage: vi.fn(),
}));

vi.mock("@/lib/postprocess/splitQuadrants", () => ({
  splitQuadrants: vi.fn(),
}));

vi.mock("@/lib/uuid", () => ({
  uuidV7: vi
    .fn()
    .mockReturnValueOnce("0193b4c3-1111-7000-8000-000000000001")
    .mockReturnValueOnce("0193b4c3-1111-7000-8000-000000000002")
    .mockReturnValueOnce("0193b4c3-1111-7000-8000-000000000003")
    .mockReturnValueOnce("0193b4c3-1111-7000-8000-000000000004"),
}));

import { POST } from "@/app/api/history/[id]/split-quadrants/route";
import * as historyRepo from "@/lib/storage/history";
import * as images from "@/lib/storage/images";
import * as splitter from "@/lib/postprocess/splitQuadrants";
import * as origin from "@/lib/auth/origin";

const VALID_ID = "0193b4c2-1234-7abc-8def-000000000001";
const PARENT_RECORD = {
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
  parentId: null,
  parentRole: null,
  quadrantIndex: null,
  childIds: null,
  createdAt: new Date().toISOString(),
};

function makeReq() {
  return new Request("http://localhost/api/history/abc/split-quadrants", {
    method: "POST",
  });
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

describe("POST /api/history/[id]/split-quadrants", () => {
  it("rejects an invalid UUID with 400", async () => {
    const res = await POST(makeReq(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_id");
  });

  it("rejects mismatched origin with 403", async () => {
    vi.mocked(origin.isAllowedOrigin).mockReturnValue(false);
    const res = await POST(makeReq(), ctx(VALID_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 when the parent does not exist", async () => {
    vi.mocked(historyRepo.getHistory).mockResolvedValue(null);
    const res = await POST(makeReq(), ctx(VALID_ID));
    expect(res.status).toBe(404);
  });

  it("rejects splitting an SVG parent with 422", async () => {
    vi.mocked(historyRepo.getHistory).mockResolvedValue({
      ...PARENT_RECORD,
      mimeType: "image/svg+xml",
    });
    const res = await POST(makeReq(), ctx(VALID_ID));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("unsupported_mime");
  });

  it("rejects splitting an existing quadrant (parent has parentId) with 422", async () => {
    vi.mocked(historyRepo.getHistory).mockResolvedValue({
      ...PARENT_RECORD,
      parentId: "0193b4c2-1234-7abc-8def-000000000099",
      parentRole: "quadrant",
      quadrantIndex: 0,
    });
    const res = await POST(makeReq(), ctx(VALID_ID));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("cannot_split_quadrant");
  });

  it("returns existing children with reused:true (idempotent)", async () => {
    vi.mocked(historyRepo.getHistory).mockResolvedValue(PARENT_RECORD);
    const existing = [0, 1, 2, 3].map((i) => ({
      ...PARENT_RECORD,
      id: `child-${i}`,
      parentId: VALID_ID,
      parentRole: "quadrant" as const,
      quadrantIndex: i,
    }));
    vi.mocked(historyRepo.findChildren).mockResolvedValue(existing);

    const res = await POST(makeReq(), ctx(VALID_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reused).toBe(true);
    expect(body.children).toHaveLength(4);
    expect(historyRepo.insertHistory).not.toHaveBeenCalled();
    expect(images.writeImage).not.toHaveBeenCalled();
  });

  it("happy path: writes 4 PNGs, inserts 4 rows, sets childIds, returns cut metadata", async () => {
    vi.mocked(historyRepo.getHistory).mockResolvedValue(PARENT_RECORD);
    vi.mocked(historyRepo.findChildren).mockResolvedValue([]);
    vi.mocked(images.readImageBytes).mockResolvedValue(Buffer.from("png"));
    vi.mocked(splitter.splitQuadrants).mockResolvedValue({
      quadrants: [
        Buffer.from("a"),
        Buffer.from("b"),
        Buffer.from("c"),
        Buffer.from("d"),
      ],
      cut: {
        width: 200,
        height: 200,
        x: 100,
        y: 100,
        detected: { vertical: true, horizontal: true },
      },
    });
    vi.mocked(images.writeImage).mockImplementation(async (args) => `${args.id}.png`);
    vi.mocked(historyRepo.insertHistory).mockImplementation(async (input) => ({
      ...PARENT_RECORD,
      id: input.id,
      parentId: input.parentId ?? null,
      parentRole: input.parentRole ?? null,
      quadrantIndex: input.quadrantIndex ?? null,
    }));

    const res = await POST(makeReq(), ctx(VALID_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reused).toBe(false);
    expect(body.children).toHaveLength(4);
    expect(body.cut).toEqual({
      x: 100,
      y: 100,
      detected: { vertical: true, horizontal: true },
    });
    expect(images.writeImage).toHaveBeenCalledTimes(4);
    expect(historyRepo.insertHistory).toHaveBeenCalledTimes(4);
    // Quadrant inserts must satisfy the History schema's `rawUsage: required`
    // and `providerMetadata` shape — Mongoose rejects null on required fields.
    for (const call of vi.mocked(historyRepo.insertHistory).mock.calls) {
      expect(call[0].rawUsage).not.toBeNull();
      expect(call[0].parentRole).toBe("quadrant");
      expect(typeof call[0].quadrantIndex).toBe("number");
    }
    expect(historyRepo.setChildIds).toHaveBeenCalledTimes(1);
    const setCall = vi.mocked(historyRepo.setChildIds).mock.calls[0];
    expect(setCall[0]).toBe(VALID_ID);
    expect(setCall[1]).toHaveLength(4);
  });

  it("returns 500 storage_failed when writeImage rejects", async () => {
    vi.mocked(historyRepo.getHistory).mockResolvedValue(PARENT_RECORD);
    vi.mocked(historyRepo.findChildren).mockResolvedValue([]);
    vi.mocked(images.readImageBytes).mockResolvedValue(Buffer.from("png"));
    vi.mocked(splitter.splitQuadrants).mockResolvedValue({
      quadrants: [
        Buffer.from("a"),
        Buffer.from("b"),
        Buffer.from("c"),
        Buffer.from("d"),
      ],
      cut: {
        width: 200,
        height: 200,
        x: 100,
        y: 100,
        detected: { vertical: true, horizontal: true },
      },
    });
    vi.mocked(images.writeImage).mockRejectedValueOnce(new Error("r2 down"));

    const res = await POST(makeReq(), ctx(VALID_ID));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("storage_failed");
    expect(historyRepo.insertHistory).not.toHaveBeenCalled();
  });
});
