import "server-only";
import sharp from "sharp";
import { sniffImageMime } from "@/lib/providers/sniff";

/**
 * Port of glyph's `src/lib/logo-edit/ingest.ts`, minus persistence: this module
 * only validates and normalizes, so the route decides where the bytes go.
 *
 * `await req.formData()` buffers the whole body in memory before we can look at
 * it, so the cap is about protecting the process, not the disk.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** What a mark can plausibly be drawn at. */
export const MAX_DIMENSION = 8000;

/**
 * Decompression-bomb guard. A 40 kB PNG can declare 50000x50000 and make sharp
 * reserve gigabytes before `metadata()` ever returns.
 */
export const MAX_INPUT_PIXELS = 50_000_000;

/**
 * SVG is deliberately absent. `/api/images/[id]` serves `image/svg+xml` from
 * our own origin, so an uploaded SVG carrying a <script> would run with the
 * session cookie. Rasterizing it is not a fix either: librsvg can resolve
 * external references, which turns the upload into SSRF.
 */
const ACCEPTED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface IngestRejection {
  ok: false;
  /** snake_case API error code. */
  code: string;
  status: number;
}

export interface NormalizedImage {
  bytes: Buffer;
  width: number;
  height: number;
}

export interface IngestSuccess extends NormalizedImage {
  ok: true;
  mimeType: "image/png";
}

export type IngestResult = IngestSuccess | IngestRejection;

/**
 * Byte-level gate, before sharp is allowed anywhere near the buffer. The
 * declared Content-Type never reaches it, only the actual bytes.
 */
export function validateUploadBytes(
  bytes: Buffer,
): { ok: true; mime: string } | IngestRejection {
  if (bytes.length === 0) {
    return { ok: false, code: "empty_file", status: 400 };
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, code: "file_too_large", status: 413 };
  }

  const mime = sniffImageMime(bytes);
  if (mime === null || !ACCEPTED_MIMES.has(mime)) {
    return { ok: false, code: "unsupported_image_type", status: 415 };
  }
  return { ok: true, mime };
}

/**
 * Re-encode to PNG. The re-encode is the security step, not a convenience: it
 * drops every metadata block (EXIF, GPS, ICC comments) and destroys polyglot
 * files, because the output is written from decoded pixels rather than copied.
 * `.rotate()` with no argument applies the EXIF orientation first, since that
 * orientation is about to be discarded along with the rest of the metadata.
 */
export async function normalizeToPng(
  bytes: Buffer,
): Promise<NormalizedImage | IngestRejection> {
  const pipeline = sharp(bytes, {
    limitInputPixels: MAX_INPUT_PIXELS,
    failOn: "truncated",
  });

  let meta;
  try {
    meta = await pipeline.metadata();
  } catch {
    return { ok: false, code: "unreadable_image", status: 422 };
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    return { ok: false, code: "unreadable_image", status: 422 };
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return { ok: false, code: "image_too_large", status: 422 };
  }

  try {
    const out = await pipeline
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
    return { bytes: out.data, width: out.info.width, height: out.info.height };
  } catch {
    return { ok: false, code: "image_conversion_failed", status: 422 };
  }
}

export function isIngestRejection(v: unknown): v is IngestRejection {
  return (
    typeof v === "object" && v !== null && (v as IngestRejection).ok === false
  );
}

/** Validate and normalize an uploaded logo. Pure: writes nothing. */
export async function ingestSourceImage(bytes: Buffer): Promise<IngestResult> {
  const validated = validateUploadBytes(bytes);
  if (isIngestRejection(validated)) return validated;

  const normalized = await normalizeToPng(bytes);
  if (isIngestRejection(normalized)) return normalized;

  return { ok: true, mimeType: "image/png", ...normalized };
}
