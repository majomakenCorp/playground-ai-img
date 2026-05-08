import { describe, expect, it } from "vitest";
import {
  DETECTOR_DEFAULTS,
  detectCrossFromRaw,
} from "@/lib/postprocess/detectCross";

const cfg = { ...DETECTOR_DEFAULTS };

function makeRaw(width: number, height: number, fill: [number, number, number, number] = [0, 0, 0, 255]) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = fill[0];
    buf[i + 1] = fill[1];
    buf[i + 2] = fill[2];
    buf[i + 3] = fill[3];
  }
  return buf;
}

function paintRow(buf: Buffer, width: number, y: number, color: [number, number, number]) {
  const base = y * width * 4;
  for (let x = 0; x < width; x++) {
    const i = base + x * 4;
    buf[i] = color[0];
    buf[i + 1] = color[1];
    buf[i + 2] = color[2];
  }
}

function paintColumn(buf: Buffer, width: number, height: number, x: number, color: [number, number, number]) {
  for (let y = 0; y < height; y++) {
    const i = (y * width + x) * 4;
    buf[i] = color[0];
    buf[i + 1] = color[1];
    buf[i + 2] = color[2];
  }
}

describe("detectCrossFromRaw", () => {
  it("detects a clean centered cross on a dark background", () => {
    const w = 200;
    const h = 200;
    const buf = makeRaw(w, h, [10, 10, 10, 255]);
    paintRow(buf, w, 100, [255, 255, 255]);
    paintColumn(buf, w, h, 100, [255, 255, 255]);

    const r = detectCrossFromRaw(buf, w, h, cfg);

    expect(r.detected.horizontal).toBe(true);
    expect(r.detected.vertical).toBe(true);
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
  });

  it("detects an off-center cross at 60/40", () => {
    const w = 200;
    const h = 200;
    const buf = makeRaw(w, h, [10, 10, 10, 255]);
    paintRow(buf, w, 80, [255, 255, 255]);
    paintColumn(buf, w, h, 120, [255, 255, 255]);

    const r = detectCrossFromRaw(buf, w, h, cfg);

    expect(r.detected.horizontal).toBe(true);
    expect(r.detected.vertical).toBe(true);
    expect(r.y).toBe(80);
    expect(r.x).toBe(120);
  });

  it("detects a thick (5px) line and centers on its middle", () => {
    const w = 200;
    const h = 200;
    const buf = makeRaw(w, h, [10, 10, 10, 255]);
    for (let y = 98; y <= 102; y++) paintRow(buf, w, y, [255, 255, 255]);
    for (let x = 98; x <= 102; x++) paintColumn(buf, w, h, x, [255, 255, 255]);

    const r = detectCrossFromRaw(buf, w, h, cfg);

    expect(r.detected.horizontal).toBe(true);
    expect(r.detected.vertical).toBe(true);
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
  });

  it("absorbs jpeg-like noise via WHITE_TOLERANCE", () => {
    const w = 200;
    const h = 200;
    const buf = makeRaw(w, h, [10, 10, 10, 255]);
    paintRow(buf, w, 100, [240, 242, 238]); // off-white but within tolerance 18
    paintColumn(buf, w, h, 100, [240, 242, 238]);

    const r = detectCrossFromRaw(buf, w, h, cfg);

    expect(r.detected.horizontal).toBe(true);
    expect(r.detected.vertical).toBe(true);
  });

  it("falls back to 50/50 when no qualifying line exists", () => {
    const w = 200;
    const h = 200;
    const buf = makeRaw(w, h, [50, 100, 200, 255]);

    const r = detectCrossFromRaw(buf, w, h, cfg);

    expect(r.detected.horizontal).toBe(false);
    expect(r.detected.vertical).toBe(false);
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
  });

  it("falls back when the image is entirely white (no interior bands)", () => {
    const w = 200;
    const h = 200;
    const buf = makeRaw(w, h, [255, 255, 255, 255]);

    const r = detectCrossFromRaw(buf, w, h, cfg);

    expect(r.detected.horizontal).toBe(false);
    expect(r.detected.vertical).toBe(false);
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
  });

  it("rejects border-only white bands", () => {
    const w = 200;
    const h = 200;
    const buf = makeRaw(w, h, [10, 10, 10, 255]);
    // White rows in the top 5% — should be filtered by minOffsetFraction.
    for (let y = 0; y < 8; y++) paintRow(buf, w, y, [255, 255, 255]);

    const r = detectCrossFromRaw(buf, w, h, cfg);

    expect(r.detected.horizontal).toBe(false);
    expect(r.y).toBe(100);
  });

  it("picks the band closest to center when two lines tie on length", () => {
    const w = 200;
    const h = 200;
    const buf = makeRaw(w, h, [10, 10, 10, 255]);
    // Two equal 1-px lines: y=60 and y=140. Closest-to-center should win.
    // Both are equidistant from center 100 (40 vs 40) — the algorithm sorts
    // stably by length+distance, so the first one wins. Verify it's one of
    // the two and not 100.
    paintRow(buf, w, 60, [255, 255, 255]);
    paintRow(buf, w, 140, [255, 255, 255]);
    paintColumn(buf, w, h, 100, [255, 255, 255]);

    const r = detectCrossFromRaw(buf, w, h, cfg);

    expect(r.detected.horizontal).toBe(true);
    expect([60, 140]).toContain(r.y);
  });

  it("rejects bands thicker than maxThicknessPx", () => {
    const w = 200;
    const h = 200;
    const buf = makeRaw(w, h, [10, 10, 10, 255]);
    // A 40px-thick "band" is a panel, not a divider line.
    for (let y = 80; y < 120; y++) paintRow(buf, w, y, [255, 255, 255]);

    const r = detectCrossFromRaw(buf, w, h, cfg);

    expect(r.detected.horizontal).toBe(false);
    expect(r.y).toBe(100);
  });
});
