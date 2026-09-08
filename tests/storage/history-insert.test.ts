import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/mongo", () => ({ connectMongo: vi.fn(async () => undefined) }));
vi.mock("@/lib/storage/models/History", () => ({
  History: { create: vi.fn() },
}));

import { History } from "@/lib/storage/models/History";
import { VARIANT_KINDS, insertHistory } from "@/lib/storage/history";

const BASE = {
  id: "0193b4c2-1234-7abc-8def-000000000001",
  providerId: "gemini-nano-banana-2",
  prompt: "p",
  imageFilename: "0193b4c2-1234-7abc-8def-000000000001.png",
  mimeType: "image/png",
  inputTokens: 1,
  outputTokens: 2,
  totalTokens: 3,
  rawUsage: {},
  providerMetadata: { edit: true },
  durationMs: 10,
};

beforeEach(() => {
  vi.mocked(History.create).mockReset();
  vi.mocked(History.create).mockImplementation((async (doc: Record<string, unknown>) => ({
    toObject: () => ({ ...doc, createdAt: new Date("2026-09-08T00:00:00Z") }),
  })) as never);
});

describe("insertHistory variants", () => {
  it("lists source as a variant kind", () => {
    expect(VARIANT_KINDS).toContain("source");
  });

  it("writes variants when given and returns them on the record", async () => {
    const source = {
      filename: `${BASE.id}.source.png`,
      mimeType: "image/png",
      createdAt: "2026-09-08T00:00:00.000Z",
    };
    const rec = await insertHistory({ ...BASE, variants: { source } });
    const doc = vi.mocked(History.create).mock.calls[0][0] as Record<string, unknown>;
    expect(doc.variants).toEqual({ source });
    expect(rec.variants).toEqual({ source });
  });

  it("writes null when variants are omitted (legacy shape)", async () => {
    const rec = await insertHistory(BASE);
    const doc = vi.mocked(History.create).mock.calls[0][0] as Record<string, unknown>;
    expect(doc.variants).toBeNull();
    expect(rec.variants).toBeNull();
  });
});
