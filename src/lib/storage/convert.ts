import "server-only";
import sharp from "sharp";

export type RasterFormat = "png" | "jpg" | "webp";

export const RASTER_FORMATS: RasterFormat[] = ["png", "jpg", "webp"];

export function isRasterFormat(v: string): v is RasterFormat {
  return (RASTER_FORMATS as string[]).includes(v);
}

const FORMAT_MIME: Record<RasterFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Strip a uniform background from a raster image by making matching pixels
 * transparent. Output is always PNG (only PNG and WebP support alpha; we use
 * PNG for maximum compatibility in download flows).
 *
 * Strategy: sample the four corner pixels. If they agree (within `tolerance`),
 * treat that color as the background and replace any pixel within tolerance
 * with `(0,0,0,0)`. Refuses if corners disagree (returns `removed: false`).
 */
export async function stripRasterBackground(
  bytes: Buffer,
  options: { tolerance?: number } = {},
): Promise<{ bytes: Buffer; mime: string; removed: boolean }> {
  const tolerance = options.tolerance ?? 12;
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    return { bytes, mime: "image/png", removed: false };
  }

  const corners = [
    pixelAt(data, width, channels, 0, 0),
    pixelAt(data, width, channels, width - 1, 0),
    pixelAt(data, width, channels, 0, height - 1),
    pixelAt(data, width, channels, width - 1, height - 1),
  ];
  const ref = corners[0];
  const cornersMatch = corners.every((c) => withinTolerance(c, ref, tolerance));
  if (!cornersMatch) {
    return { bytes, mime: "image/png", removed: false };
  }

  const tol2 = tolerance * tolerance * 3;
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += channels) {
    const dr = out[i] - ref[0];
    const dg = out[i + 1] - ref[1];
    const db = out[i + 2] - ref[2];
    if (dr * dr + dg * dg + db * db <= tol2) {
      out[i + 3] = 0;
    }
  }

  const png = await sharp(out, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  return { bytes: png, mime: "image/png", removed: true };
}

function pixelAt(
  data: Buffer,
  width: number,
  channels: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const idx = (y * width + x) * channels;
  return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
}

function withinTolerance(
  a: [number, number, number, number],
  b: [number, number, number, number],
  tol: number,
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tol &&
    Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol
  );
}

export async function convertRaster(
  bytes: Buffer,
  target: RasterFormat,
): Promise<{ bytes: Buffer; mime: string }> {
  const pipe = sharp(bytes);
  let out: Buffer;
  switch (target) {
    case "png":
      out = await pipe.png().toBuffer();
      break;
    case "jpg":
      out = await pipe.flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
      break;
    case "webp":
      out = await pipe.webp({ quality: 90 }).toBuffer();
      break;
  }
  return { bytes: out, mime: FORMAT_MIME[target] };
}
