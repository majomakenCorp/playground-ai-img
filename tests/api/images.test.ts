import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/images", () => ({
  resolveImage: vi.fn(),
  readImageBytes: vi.fn(),
}));

import { GET } from "@/app/api/images/[id]/route";
import * as images from "@/lib/storage/images";

const ID = "0193b4c2-1234-7abc-8def-000000000001";

function get(id: string, query = "") {
  return GET(new Request(`http://localhost/api/images/${id}${query}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/images/[id]", () => {
  it("serves the source variant of an edit", async () => {
    vi.mocked(images.resolveImage).mockResolvedValue({
      filename: `${ID}.source.png`,
      ext: "png",
      mime: "image/png",
    });
    vi.mocked(images.readImageBytes).mockResolvedValue(Buffer.from("png-bytes"));

    const res = await get(ID, "?variant=source");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(images.resolveImage).toHaveBeenCalledWith(ID, "source");
    expect(images.readImageBytes).toHaveBeenCalledWith(`${ID}.source.png`);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("png-bytes");
  });

  it("rejects an unknown variant with 400 before touching storage", async () => {
    const res = await get(ID, "?variant=bogus");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_variant");
    expect(images.resolveImage).not.toHaveBeenCalled();
  });

  it("rejects a non-UUIDv7 id with 400", async () => {
    const res = await get("../etc/passwd");
    expect(res.status).toBe(400);
    expect(images.resolveImage).not.toHaveBeenCalled();
  });

  it("returns 404 when the variant is not stored", async () => {
    vi.mocked(images.resolveImage).mockResolvedValue(null);
    const res = await get(ID, "?variant=source");
    expect(res.status).toBe(404);
  });
});
