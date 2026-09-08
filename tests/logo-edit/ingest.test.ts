import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  MAX_UPLOAD_BYTES,
  ingestSourceImage,
  normalizeToPng,
  validateUploadBytes,
} from "@/lib/logo-edit/ingest";

async function solid(format: "png" | "jpeg" | "webp", width = 8, height = 6) {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  });
  if (format === "png") return base.png().toBuffer();
  if (format === "jpeg") return base.jpeg().toBuffer();
  return base.webp().toBuffer();
}

describe("validateUploadBytes", () => {
  it("accepts png, jpeg and webp by magic bytes", async () => {
    for (const fmt of ["png", "jpeg", "webp"] as const) {
      const res = validateUploadBytes(await solid(fmt));
      expect(res.ok).toBe(true);
    }
  });

  it("rejects an empty upload with 400 empty_file", () => {
    expect(validateUploadBytes(Buffer.alloc(0))).toEqual({
      ok: false,
      code: "empty_file",
      status: 400,
    });
  });

  it("rejects an oversize upload with 413 before looking at the bytes", () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x89);
    expect(validateUploadBytes(big)).toEqual({
      ok: false,
      code: "file_too_large",
      status: 413,
    });
  });

  it("rejects SVG (plain and padded), text and unknown binaries with 415", () => {
    const cases = [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      Buffer.from('\n  <?xml version="1.0"?><svg></svg>'),
      Buffer.from("hello world, this is not an image at all"),
      Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c]),
    ];
    for (const bytes of cases) {
      expect(validateUploadBytes(bytes)).toEqual({
        ok: false,
        code: "unsupported_image_type",
        status: 415,
      });
    }
  });
});

describe("normalizeToPng", () => {
  it("re-encodes a JPEG with EXIF to a PNG without metadata, keeping dimensions", async () => {
    const jpegWithExif = await sharp({
      create: { width: 10, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "playground test" } } })
      .toBuffer();
    expect((await sharp(jpegWithExif).metadata()).exif).toBeDefined();

    const out = await normalizeToPng(jpegWithExif);
    expect("ok" in out).toBe(false);
    if ("ok" in out) return;
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("png");
    expect(meta.exif).toBeUndefined();
    expect(out.width).toBe(10);
    expect(out.height).toBe(4);
  });

  it("rejects an image wider than MAX_DIMENSION with 422 image_too_large", async () => {
    const wide = await sharp({
      create: { width: 8001, height: 1, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect(await normalizeToPng(wide)).toEqual({
      ok: false,
      code: "image_too_large",
      status: 422,
    });
  });

  it("rejects a PNG signature followed by garbage with 422", async () => {
    const broken = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 0xab),
    ]);
    const out = await normalizeToPng(broken);
    expect(out).toMatchObject({ ok: false, status: 422 });
  });
});

describe("ingestSourceImage", () => {
  it("returns normalized PNG bytes with dimensions and a fixed mime", async () => {
    const res = await ingestSourceImage(await solid("webp", 12, 9));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mimeType).toBe("image/png");
    expect(res.width).toBe(12);
    expect(res.height).toBe(9);
    expect((await sharp(res.bytes).metadata()).format).toBe("png");
  });

  it("propagates byte-level rejections untouched", async () => {
    expect(await ingestSourceImage(Buffer.from("<svg/>"))).toEqual({
      ok: false,
      code: "unsupported_image_type",
      status: 415,
    });
  });
});
