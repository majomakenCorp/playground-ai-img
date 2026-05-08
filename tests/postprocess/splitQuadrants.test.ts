import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { splitQuadrants } from "@/lib/postprocess/splitQuadrants";

async function makeCrossPng(opts: {
  width: number;
  height: number;
  cutX: number;
  cutY: number;
  background?: { r: number; g: number; b: number };
}) {
  const { width, height, cutX, cutY } = opts;
  const bg = opts.background ?? { r: 30, g: 60, b: 120 };
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const onCross = x === cutX || y === cutY;
      buf[i] = onCross ? 255 : bg.r;
      buf[i + 1] = onCross ? 255 : bg.g;
      buf[i + 2] = onCross ? 255 : bg.b;
      buf[i + 3] = 255;
    }
  }
  return sharp(buf, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

async function pngDimensions(bytes: Buffer) {
  const meta = await sharp(bytes).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

describe("splitQuadrants", () => {
  it("produces 4 PNG quadrants whose dimensions sum to the original on a centered cross", async () => {
    const png = await makeCrossPng({ width: 200, height: 200, cutX: 100, cutY: 100 });

    const r = await splitQuadrants(png);

    expect(r.quadrants).toHaveLength(4);
    expect(r.cut.detected.horizontal).toBe(true);
    expect(r.cut.detected.vertical).toBe(true);
    expect(r.cut.x).toBe(100);
    expect(r.cut.y).toBe(100);

    const dims = await Promise.all(r.quadrants.map(pngDimensions));
    expect(dims[0]).toEqual({ width: 100, height: 100 });
    expect(dims[1]).toEqual({ width: 100, height: 100 });
    expect(dims[2]).toEqual({ width: 100, height: 100 });
    expect(dims[3]).toEqual({ width: 100, height: 100 });
  });

  it("produces 4 quadrants on an off-center cross at (60,80) and dimensions match the cut", async () => {
    const png = await makeCrossPng({ width: 200, height: 200, cutX: 60, cutY: 80 });

    const r = await splitQuadrants(png);

    expect(r.cut.x).toBe(60);
    expect(r.cut.y).toBe(80);
    const dims = await Promise.all(r.quadrants.map(pngDimensions));
    expect(dims[0]).toEqual({ width: 60, height: 80 });
    expect(dims[1]).toEqual({ width: 140, height: 80 });
    expect(dims[2]).toEqual({ width: 60, height: 120 });
    expect(dims[3]).toEqual({ width: 140, height: 120 });
  });

  it("falls back to 50/50 when no cross is detectable", async () => {
    const buf = Buffer.alloc(200 * 200 * 4);
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = 30;
      buf[i + 1] = 60;
      buf[i + 2] = 120;
      buf[i + 3] = 255;
    }
    const png = await sharp(buf, { raw: { width: 200, height: 200, channels: 4 } })
      .png()
      .toBuffer();

    const r = await splitQuadrants(png);

    expect(r.cut.detected.horizontal).toBe(false);
    expect(r.cut.detected.vertical).toBe(false);
    expect(r.cut.x).toBe(100);
    expect(r.cut.y).toBe(100);
    expect(r.quadrants).toHaveLength(4);
    const dims = await Promise.all(r.quadrants.map(pngDimensions));
    for (const d of dims) expect(d).toEqual({ width: 100, height: 100 });
  });
});
