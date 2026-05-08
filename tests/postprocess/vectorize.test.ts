import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { detectPolarity, vectorize } from "@/lib/postprocess/vectorize";

async function circlePng(size: number, opts: {
  fg: [number, number, number];
  bg: [number, number, number];
  bgAlpha?: number;
}) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
      const [R, G, B] = inside ? opts.fg : opts.bg;
      buf[i] = R;
      buf[i + 1] = G;
      buf[i + 2] = B;
      buf[i + 3] = inside ? 255 : (opts.bgAlpha ?? 255);
    }
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
}

const blackCircleOnWhitePng = (size = 64) =>
  circlePng(size, { fg: [0, 0, 0], bg: [255, 255, 255] });
const whiteCircleOnBlackPng = (size = 64) =>
  circlePng(size, { fg: [255, 255, 255], bg: [0, 0, 0] });
const darkLogoOnTransparentPng = (size = 64) =>
  circlePng(size, { fg: [20, 20, 20], bg: [255, 255, 255], bgAlpha: 0 });

describe("detectPolarity", () => {
  it("identifies dark subject on light background", async () => {
    const png = await blackCircleOnWhitePng();
    const p = await detectPolarity(png);
    expect(p.blackOnWhite).toBe(true);
    expect(p.flattenColor).toBe("#ffffff");
  });

  it("identifies light subject on dark background", async () => {
    const png = await whiteCircleOnBlackPng();
    const p = await detectPolarity(png);
    expect(p.blackOnWhite).toBe(false);
    expect(p.flattenColor).toBe("#000000");
  });

  it("treats transparent corners as white background (dark logo on transparent)", async () => {
    const png = await darkLogoOnTransparentPng();
    const p = await detectPolarity(png);
    expect(p.blackOnWhite).toBe(true);
    expect(p.flattenColor).toBe("#ffffff");
  });
});

describe("vectorize", () => {
  it("traces a black-on-white shape into a non-empty SVG with a black fill", async () => {
    const png = await blackCircleOnWhitePng();

    const r = await vectorize(png);

    expect(r.mime).toBe("image/svg+xml");
    expect(r.svg).toMatch(/<svg\b/);
    expect(r.svg).toMatch(/<path\b/);
    // Must be visible (black fill), not the bundler default white.
    expect(r.svg.toLowerCase()).toMatch(/fill="#000000"/);
    expect(r.bytes.length).toBeGreaterThan(0);
    expect(r.bytes.length).toBe(Buffer.byteLength(r.svg, "utf8"));
  });

  it("traces a light-on-dark logo with the same visible black fill (polarity flipped)", async () => {
    const png = await whiteCircleOnBlackPng();

    const r = await vectorize(png);

    expect(r.svg).toMatch(/<path\b/);
    expect(r.svg.toLowerCase()).toMatch(/fill="#000000"/);
  });

  it("rejects unsupported modes", async () => {
    const png = await blackCircleOnWhitePng(8);

    await expect(
      // @ts-expect-error — testing the runtime guard
      vectorize(png, { mode: "color" }),
    ).rejects.toThrow(/unsupported vectorize mode/);
  });
});
