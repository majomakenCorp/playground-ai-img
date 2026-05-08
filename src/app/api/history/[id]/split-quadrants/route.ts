import { NextResponse } from "next/server";
import { isAllowedOrigin } from "@/lib/auth/origin";
import { UuidV7Schema } from "@/lib/validation/schemas";
import {
  findChildren,
  getHistory,
  insertHistory,
  setChildIds,
  type HistoryRecord,
} from "@/lib/storage/history";
import { readImageBytes, writeImage } from "@/lib/storage/images";
import { splitQuadrants } from "@/lib/postprocess/splitQuadrants";
import { uuidV7 } from "@/lib/uuid";

const RASTER_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

interface ChildSummary {
  id: string;
  imageUrl: string;
  quadrantIndex: number;
}

function summarize(records: HistoryRecord[]): ChildSummary[] {
  return records.map((r) => ({
    id: r.id,
    imageUrl: `/api/images/${r.id}`,
    quadrantIndex: r.quadrantIndex ?? 0,
  }));
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const parsed = UuidV7Schema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const parentId = parsed.data;

  const parent = await getHistory(parentId);
  if (!parent) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (parent.parentId) {
    // Quadrants of quadrants are out of scope and would create N×4 fan-out.
    return NextResponse.json(
      { error: "cannot_split_quadrant" },
      { status: 422 },
    );
  }
  if (!RASTER_MIMES.has(parent.mimeType)) {
    return NextResponse.json(
      { error: "unsupported_mime" },
      { status: 422 },
    );
  }

  const existing = await findChildren(parentId, "quadrant");
  if (existing.length === 4) {
    return NextResponse.json({
      ok: true,
      reused: true,
      cut: null,
      children: summarize(existing),
    });
  }

  let originalBytes: Buffer;
  try {
    originalBytes = await readImageBytes(parent.imageFilename);
  } catch (err) {
    console.error("[split-quadrants] read failed", err);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  let split;
  try {
    split = await splitQuadrants(originalBytes);
  } catch (err) {
    console.error("[split-quadrants] split failed", err);
    return NextResponse.json({ error: "split_failed" }, { status: 500 });
  }

  // Allocate IDs up front so we can roll back uniformly on partial R2 failure.
  const childIds = Array.from({ length: 4 }, () => uuidV7());

  try {
    await Promise.all(
      split.quadrants.map((bytes, i) =>
        writeImage({ id: childIds[i], ext: "png", bytes }),
      ),
    );
  } catch (err) {
    console.error("[split-quadrants] write failed", err);
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }

  const inserted: HistoryRecord[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const id = childIds[i];
      const rec = await insertHistory({
        id,
        providerId: parent.providerId,
        prompt: parent.prompt,
        imageFilename: `${id}.png`,
        mimeType: "image/png",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        rawUsage: {},
        providerMetadata: { source: "quadrant", parentId, quadrantIndex: i },
        parentId,
        parentRole: "quadrant",
        quadrantIndex: i,
      });
      inserted.push(rec);
    }
    await setChildIds(parentId, childIds);
  } catch (err) {
    console.error("[split-quadrants] history insert failed", err);
    return NextResponse.json({ error: "history_failed" }, { status: 503 });
  }

  console.log("[split-quadrants]", {
    parentId,
    cut: { x: split.cut.x, y: split.cut.y, detected: split.cut.detected },
  });

  return NextResponse.json({
    ok: true,
    reused: false,
    cut: {
      x: split.cut.x,
      y: split.cut.y,
      detected: split.cut.detected,
    },
    children: summarize(inserted),
  });
}
