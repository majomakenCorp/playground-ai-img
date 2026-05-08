import "server-only";
import sharp from "sharp";
import { detectCross, type DetectCrossResult } from "./detectCross";

export interface SplitQuadrantResult {
  /**
   * 4 PNG buffers in deterministic order:
   *   index 0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right
   */
  quadrants: Buffer[];
  cut: DetectCrossResult;
}

/**
 * Slice a raster image into 4 PNG buffers along an auto-detected white cross
 * (or 50/50 fallback). Output order is fixed and matches `quadrantIndex` in
 * the History schema. Sharp's `extract()` is stateless per call, so we
 * re-invoke it for each quadrant rather than reusing a pipeline.
 */
export async function splitQuadrants(
  bytes: Buffer,
): Promise<SplitQuadrantResult> {
  const cut = await detectCross(bytes);
  const { width, height, x, y } = cut;

  const cuts: Array<{ left: number; top: number; w: number; h: number }> = [
    { left: 0, top: 0, w: x, h: y },
    { left: x, top: 0, w: width - x, h: y },
    { left: 0, top: y, w: x, h: height - y },
    { left: x, top: y, w: width - x, h: height - y },
  ];

  // Defensive: sharp.extract refuses width/height of 0 — clamp to 1px so a
  // pathological detection (e.g. x=0 or x=width) still produces 4 outputs.
  const quadrants = await Promise.all(
    cuts.map(({ left, top, w, h }) =>
      sharp(bytes)
        .extract({
          left: Math.max(0, Math.min(left, width - 1)),
          top: Math.max(0, Math.min(top, height - 1)),
          width: Math.max(1, Math.min(w, width - left)),
          height: Math.max(1, Math.min(h, height - top)),
        })
        .png()
        .toBuffer(),
    ),
  );

  return { quadrants, cut };
}
