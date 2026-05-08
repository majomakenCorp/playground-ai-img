import "server-only";
import sharp from "sharp";

/**
 * Tunable thresholds for the white-line detector. Frozen for v1; the SDD
 * (§6.3) documents how these were chosen and what to nudge if a future
 * provider changes the line style.
 */
export const DETECTOR_DEFAULTS = {
  whiteTolerance: 18,
  minLineFraction: 0.85,
  minThicknessPx: 1,
  maxThicknessPx: 24,
  minOffsetFraction: 0.1,
} as const;

export interface DetectCrossOptions {
  whiteTolerance?: number;
  minLineFraction?: number;
  minThicknessPx?: number;
  maxThicknessPx?: number;
  minOffsetFraction?: number;
}

export interface DetectCrossResult {
  width: number;
  height: number;
  /** X coordinate where the vertical line is centered (or 50% if not detected). */
  x: number;
  /** Y coordinate where the horizontal line is centered (or 50% if not detected). */
  y: number;
  detected: { vertical: boolean; horizontal: boolean };
}

/**
 * Locate a near-white vertical and horizontal divider line in a raster image.
 * Falls back to the geometric center on either axis when no qualifying band
 * is found. The algorithm is a 1-D row/column projection on raw RGBA: for
 * each scanline, count pixels that fall within `whiteTolerance` of pure
 * white; rows above `minLineFraction` are candidates; the longest contiguous
 * band whose thickness sits in [min,max] thickness wins, tie-broken by
 * proximity to the geometric center.
 */
export async function detectCross(
  bytes: Buffer,
  options: DetectCrossOptions = {},
): Promise<DetectCrossResult> {
  const cfg = { ...DETECTOR_DEFAULTS, ...stripUndefined(options) };
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error("expected 4-channel raw output from sharp");
  }
  return detectCrossFromRaw(data, width, height, cfg);
}

interface ResolvedConfig {
  whiteTolerance: number;
  minLineFraction: number;
  minThicknessPx: number;
  maxThicknessPx: number;
  minOffsetFraction: number;
}

/** Pure function — exposed for unit tests that build synthetic buffers. */
export function detectCrossFromRaw(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  cfg: ResolvedConfig = { ...DETECTOR_DEFAULTS },
): DetectCrossResult {
  const horizontal = detectAxis(data, width, height, "horizontal", cfg);
  const vertical = detectAxis(data, width, height, "vertical", cfg);
  return {
    width,
    height,
    x: vertical?.center ?? Math.round(width / 2),
    y: horizontal?.center ?? Math.round(height / 2),
    detected: {
      vertical: vertical !== null,
      horizontal: horizontal !== null,
    },
  };
}

interface Band {
  start: number;
  end: number;
  length: number;
  center: number;
  whiteness: number;
}

function detectAxis(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  axis: "horizontal" | "vertical",
  cfg: ResolvedConfig,
): Band | null {
  const projection =
    axis === "horizontal"
      ? rowProjection(data, width, height, cfg.whiteTolerance)
      : columnProjection(data, width, height, cfg.whiteTolerance);

  const axisLength = axis === "horizontal" ? height : width;
  const bands = findBands(projection, cfg.minLineFraction);
  const offsetMin = axisLength * cfg.minOffsetFraction;
  const offsetMax = axisLength * (1 - cfg.minOffsetFraction);

  const candidates = bands.filter(
    (b) =>
      b.length >= cfg.minThicknessPx &&
      b.length <= cfg.maxThicknessPx &&
      b.start >= offsetMin &&
      b.end <= offsetMax,
  );
  if (candidates.length === 0) return null;

  // Pick longest; tiebreak by proximity to center.
  const center = axisLength / 2;
  candidates.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return Math.abs(a.center - center) - Math.abs(b.center - center);
  });
  return candidates[0];
}

function rowProjection(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  tolerance: number,
): Float32Array {
  const out = new Float32Array(height);
  const threshold = 255 - tolerance;
  for (let y = 0; y < height; y++) {
    let count = 0;
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = base + x * 4;
      if (
        data[i] >= threshold &&
        data[i + 1] >= threshold &&
        data[i + 2] >= threshold
      ) {
        count++;
      }
    }
    out[y] = count / width;
  }
  return out;
}

function columnProjection(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  tolerance: number,
): Float32Array {
  const out = new Float32Array(width);
  const threshold = 255 - tolerance;
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      if (
        data[i] >= threshold &&
        data[i + 1] >= threshold &&
        data[i + 2] >= threshold
      ) {
        count++;
      }
    }
    out[x] = count / height;
  }
  return out;
}

function findBands(
  projection: Float32Array,
  minFraction: number,
): Band[] {
  const bands: Band[] = [];
  let start = -1;
  let sum = 0;
  for (let i = 0; i < projection.length; i++) {
    const above = projection[i] >= minFraction;
    if (above && start === -1) {
      start = i;
      sum = projection[i];
    } else if (above) {
      sum += projection[i];
    } else if (!above && start !== -1) {
      const end = i - 1;
      const length = end - start + 1;
      bands.push({
        start,
        end,
        length,
        center: Math.round((start + end) / 2),
        whiteness: sum / length,
      });
      start = -1;
      sum = 0;
    }
  }
  if (start !== -1) {
    const end = projection.length - 1;
    const length = end - start + 1;
    bands.push({
      start,
      end,
      length,
      center: Math.round((start + end) / 2),
      whiteness: sum / length,
    });
  }
  return bands;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
