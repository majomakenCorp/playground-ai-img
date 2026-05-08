import "server-only";
import sharp from "sharp";
import * as potrace from "potrace";

const MAX_DIMENSION_PX = 2048;

export type VectorizeMode = "mono";

export const SUPPORTED_VECTORIZE_MODES: readonly VectorizeMode[] = ["mono"];

export interface VectorizeOptions {
  mode?: VectorizeMode;
}

export interface VectorizeResult {
  svg: string;
  bytes: Buffer;
  mime: "image/svg+xml";
}

/**
 * Vectorize a PNG/JPEG/WebP buffer to a monochrome SVG via potrace. Caps the
 * input at 2048 px on the longest side to bound trace time. Auto-detects
 * polarity (dark logo on light bg vs light logo on dark bg) by comparing the
 * mean brightness of the opaque pixels against the four corners — this
 * decides whether potrace should trace the dark or the light side, and which
 * color to flatten the alpha channel onto. Always fills the trace with
 * black so the resulting SVG is visible regardless of the source's polarity.
 *
 * Future expansion (color mode) goes behind the `mode` option without
 * changing the variant kind on the History row.
 */
export async function vectorize(
  bytes: Buffer,
  options: VectorizeOptions = {},
): Promise<VectorizeResult> {
  const mode = options.mode ?? "mono";
  if (mode !== "mono") {
    throw new Error(`unsupported vectorize mode: ${mode}`);
  }

  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("unable to read source dimensions");
  }

  let pipeline = sharp(bytes);
  if (Math.max(width, height) > MAX_DIMENSION_PX) {
    pipeline = pipeline.resize({
      width: width >= height ? MAX_DIMENSION_PX : undefined,
      height: height > width ? MAX_DIMENSION_PX : undefined,
      fit: "inside",
    });
  }
  // Keep alpha through this stage so polarity detection can weight by alpha.
  const resized = await pipeline.png().toBuffer();

  const polarity = await detectPolarity(resized);

  const flattened = await sharp(resized)
    .flatten({ background: polarity.flattenColor })
    .png()
    .toBuffer();

  const svg = await traceAsync(flattened, {
    threshold: -1,
    turdSize: 2,
    optTolerance: 0.4,
    blackOnWhite: polarity.blackOnWhite,
    // Force a visible fill regardless of polarity (auto would emit white
    // when blackOnWhite=false, which is invisible on light backgrounds).
    color: "#000000",
    background: "transparent",
  });

  return {
    svg,
    bytes: Buffer.from(svg, "utf8"),
    mime: "image/svg+xml",
  };
}

interface Polarity {
  /** True when the subject is dark on a light background. */
  blackOnWhite: boolean;
  /** Color to flatten alpha onto so transparent regions become "background". */
  flattenColor: "#ffffff" | "#000000";
  subjectBrightness: number;
  cornerBrightness: number;
}

/** Exposed for unit tests. */
export async function detectPolarity(bytes: Buffer): Promise<Polarity> {
  const { data, info } = await sharp(bytes)
    .resize(64, 64, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Subject = pixels with non-trivial alpha. For fully-opaque PNGs every
  // pixel qualifies, so this collapses to a global mean.
  let subjectSum = 0;
  let subjectCount = 0;
  for (let i = 0; i < data.length; i += channels) {
    const a = data[i + 3];
    if (a > 32) {
      subjectSum += luma(data[i], data[i + 1], data[i + 2]);
      subjectCount++;
    }
  }
  const subjectBrightness = subjectCount > 0 ? subjectSum / subjectCount : 128;

  const corners: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let cornerSum = 0;
  for (const [x, y] of corners) {
    const i = (y * width + x) * channels;
    // For a transparent corner, treat as "white background" so flattenColor
    // defaults to white and we trace the (presumably dark) subject normally.
    if (data[i + 3] < 32) {
      cornerSum += 255;
    } else {
      cornerSum += luma(data[i], data[i + 1], data[i + 2]);
    }
  }
  const cornerBrightness = cornerSum / corners.length;

  // Subject darker than corners → standard "black on white".
  // Subject lighter than corners → "white on black"; flip both polarity and
  // the flatten color so transparent areas don't fight the trace.
  const blackOnWhite = subjectBrightness <= cornerBrightness;
  const flattenColor: "#ffffff" | "#000000" = blackOnWhite
    ? "#ffffff"
    : "#000000";

  return { blackOnWhite, flattenColor, subjectBrightness, cornerBrightness };
}

function luma(r: number, g: number, b: number): number {
  // ITU-R BT.601 — close enough for polarity detection.
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function traceAsync(
  bytes: Buffer,
  opts: potrace.PotraceOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    potrace.trace(bytes, opts, (err: Error | null, svg: string) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
}
