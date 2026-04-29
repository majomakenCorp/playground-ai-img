import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { sniffImageMime } from "@/lib/providers/sniff";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const EXTS = Array.from(new Set(Object.values(MIME_TO_EXT)));
const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export function extForMime(mime: string): string | null {
  return MIME_TO_EXT[mime.toLowerCase()] ?? null;
}

export async function writeImage(args: {
  id: string;
  ext: string;
  bytes: Buffer;
  variant?: string;
}): Promise<string> {
  if (!EXTS.includes(args.ext)) {
    throw new Error(`refusing to write unknown extension: ${args.ext}`);
  }
  if (args.variant && !/^[a-z0-9_-]+$/.test(args.variant)) {
    throw new Error(`invalid variant name: ${args.variant}`);
  }
  const dir = await ensureDir();
  const filename = args.variant
    ? `${args.id}.${args.variant}.${args.ext}`
    : `${args.id}.${args.ext}`;
  const tmp = path.join(dir, `${filename}.tmp`);
  const final = path.join(dir, filename);
  await fs.writeFile(tmp, args.bytes, { mode: 0o640 });
  await fs.rename(tmp, final);
  return filename;
}

export async function readImageBytes(filename: string): Promise<Buffer> {
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
    throw new Error("invalid filename");
  }
  const dir = await ensureDir();
  const full = path.join(dir, filename);
  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("path traversal");
  }
  return fs.readFile(full);
}

export async function resolveImagePath(
  id: string,
  variant?: string,
): Promise<{ full: string; ext: string; mime: string } | null> {
  if (variant && !/^[a-z0-9_-]+$/.test(variant)) return null;
  const dir = await ensureDir();
  const stem = variant ? `${id}.${variant}` : id;
  for (const ext of EXTS) {
    const full = path.join(dir, `${stem}.${ext}`);
    const rel = path.relative(dir, full);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    try {
      await fs.access(full);
      // Defense against legacy/mislabeled files: re-sniff the actual bytes.
      // If the head is a recognizable image format, use that mime; otherwise
      // fall back to the mime implied by the on-disk extension.
      const head = await readHead(full, 512);
      const sniffed = sniffImageMime(head);
      const mime = sniffed ?? EXT_TO_MIME[ext];
      return { full, ext, mime };
    } catch {
      // try next
    }
  }
  return null;
}

async function readHead(file: string, bytes: number): Promise<Buffer> {
  const fh = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

let dirReady: Promise<string> | null = null;
function ensureDir(): Promise<string> {
  if (!dirReady) {
    const dir = path.resolve(process.cwd(), env.IMAGES_DIR);
    dirReady = fs
      .mkdir(dir, { recursive: true })
      .then(() => dir)
      .catch((err) => {
        dirReady = null;
        throw err;
      });
  }
  return dirReady;
}
