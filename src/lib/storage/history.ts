import "server-only";
import { connectMongo } from "@/lib/storage/mongo";
import { History, type HistoryDoc } from "@/lib/storage/models/History";

export interface HistoryVariant {
  filename: string;
  mimeType: string;
  createdAt: string;
}

/**
 * `source` is the normalized upload an edit started from (`<id>.source.png`),
 * written together with the result under the same history id.
 */
export type HistoryVariantKind = "transparent" | "vector" | "source";

export const VARIANT_KINDS: readonly HistoryVariantKind[] = [
  "transparent",
  "vector",
  "source",
] as const;

export type HistoryParentRole = "quadrant";

export interface HistoryRecord {
  id: string;
  providerId: string;
  prompt: string;
  imageFilename: string;
  mimeType: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  rawUsage: unknown;
  providerMetadata: Record<string, unknown> | null;
  variants: Partial<Record<HistoryVariantKind, HistoryVariant>> | null;
  parentId: string | null;
  parentRole: HistoryParentRole | null;
  quadrantIndex: number | null;
  childIds: string[] | null;
  durationMs: number | null;
  createdAt: string;
}

export interface InsertHistoryInput {
  id: string;
  providerId: string;
  prompt: string;
  imageFilename: string;
  mimeType: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  rawUsage: unknown;
  providerMetadata: Record<string, unknown> | null;
  parentId?: string | null;
  parentRole?: HistoryParentRole | null;
  quadrantIndex?: number | null;
  durationMs: number;
  /** Variants known at insert time (an edit's source); omit for `null`. */
  variants?: Partial<Record<HistoryVariantKind, HistoryVariant>> | null;
}

export async function insertHistory(
  input: InsertHistoryInput,
): Promise<HistoryRecord> {
  await connectMongo();
  const doc = await History.create({
    _id: input.id,
    providerId: input.providerId,
    prompt: input.prompt,
    imageFilename: input.imageFilename,
    mimeType: input.mimeType,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.totalTokens,
    rawUsage: input.rawUsage,
    providerMetadata: input.providerMetadata,
    parentId: input.parentId ?? null,
    parentRole: input.parentRole ?? null,
    quadrantIndex: input.quadrantIndex ?? null,
    durationMs: input.durationMs,
    variants: input.variants ?? null,
  });
  return toRecord(doc.toObject());
}

export async function listHistory(args: {
  limit: number;
  before?: Date;
}): Promise<HistoryRecord[]> {
  await connectMongo();
  // Sidebar feed shows top-level images only; quadrants are surfaced in the
  // dedicated postprocesado view instead.
  const filter: Record<string, unknown> = {
    $or: [{ parentId: null }, { parentId: { $exists: false } }],
  };
  if (args.before) {
    filter.createdAt = { $lt: args.before };
  }
  const docs = await History.find(filter)
    .sort({ createdAt: -1 })
    .limit(args.limit)
    .lean();
  return docs.map(toRecord);
}

export interface UsageTotal {
  providerId: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  firstAt: string | null;
  lastAt: string | null;
  avgDurationMs: number | null;
  totalDurationMs: number | null;
  maxDurationMs: number | null;
}

interface AggregateRow {
  _id: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  firstAt: Date | null;
  lastAt: Date | null;
  avgDurationMs: number | null;
  totalDurationMs: number | null;
  maxDurationMs: number | null;
}

export async function aggregateUsage(): Promise<UsageTotal[]> {
  await connectMongo();
  // Quadrants don't call any provider — exclude them so they don't pollute
  // the per-provider totals (their token counts are 0 anyway, but their row
  // counts would inflate "count").
  const rows = await History.aggregate<AggregateRow>([
    { $match: { $or: [{ parentId: null }, { parentId: { $exists: false } }] } },
    {
      $group: {
        _id: "$providerId",
        count: { $sum: 1 },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        totalTokens: { $sum: "$totalTokens" },
        firstAt: { $min: "$createdAt" },
        lastAt: { $max: "$createdAt" },
        avgDurationMs: { $avg: "$durationMs" },
        totalDurationMs: { $sum: "$durationMs" },
        maxDurationMs: { $max: "$durationMs" },
      },
    },
    { $sort: { totalTokens: -1 } },
  ]);
  return rows.map((r) => ({
    providerId: r._id,
    count: r.count,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    totalTokens: r.totalTokens,
    firstAt: r.firstAt ? r.firstAt.toISOString() : null,
    lastAt: r.lastAt ? r.lastAt.toISOString() : null,
    avgDurationMs:
      typeof r.avgDurationMs === "number" ? Math.round(r.avgDurationMs) : null,
    totalDurationMs:
      typeof r.totalDurationMs === "number" ? r.totalDurationMs : null,
    maxDurationMs:
      typeof r.maxDurationMs === "number" ? r.maxDurationMs : null,
  }));
}

export async function getHistory(id: string): Promise<HistoryRecord | null> {
  await connectMongo();
  const doc = await History.findById(id).lean();
  return doc ? toRecord(doc) : null;
}

export async function findChildren(
  parentId: string,
  role: HistoryParentRole = "quadrant",
): Promise<HistoryRecord[]> {
  await connectMongo();
  const docs = await History.find({ parentId, parentRole: role })
    .sort({ quadrantIndex: 1 })
    .lean();
  return docs.map(toRecord);
}

export interface PostprocesadoGroup {
  parent: HistoryRecord;
  quadrants: HistoryRecord[];
}

/**
 * Returns groups whose parent has at least one quadrant child. Ordered by
 * the parent's createdAt (newest first). Cursor pagination is on the parent
 * createdAt, so a `before` cursor walks backwards in time.
 */
export async function findPostprocesado(args: {
  limit: number;
  before?: Date;
}): Promise<PostprocesadoGroup[]> {
  await connectMongo();
  const matchParent: Record<string, unknown> = {
    childIds: { $exists: true, $ne: [] },
  };
  if (args.before) {
    matchParent.createdAt = { $lt: args.before };
  }
  const parents = await History.find(matchParent)
    .sort({ createdAt: -1 })
    .limit(args.limit)
    .lean();
  if (parents.length === 0) return [];

  const parentIds = parents.map((p) => p._id);
  const children = await History.find({
    parentId: { $in: parentIds },
    parentRole: "quadrant",
  })
    .sort({ parentId: 1, quadrantIndex: 1 })
    .lean();

  const byParent = new Map<string, HistoryRecord[]>();
  for (const c of children) {
    const rec = toRecord(c);
    const arr = byParent.get(rec.parentId!) ?? [];
    arr.push(rec);
    byParent.set(rec.parentId!, arr);
  }

  return parents.map((p) => ({
    parent: toRecord(p),
    quadrants: byParent.get(p._id) ?? [],
  }));
}

export async function setVariant(
  id: string,
  kind: HistoryVariantKind,
  variant: HistoryVariant,
): Promise<void> {
  await connectMongo();
  // First clear `variants` if it's null (legacy rows default to null and
  // Mongo refuses dotted-path $set into a non-object scalar).
  await History.updateOne(
    { _id: id, variants: null },
    { $unset: { variants: "" } },
  );
  await History.updateOne(
    { _id: id },
    { $set: { [`variants.${kind}`]: variant } },
  );
}

export async function setChildIds(
  parentId: string,
  childIds: string[],
): Promise<void> {
  await connectMongo();
  await History.updateOne({ _id: parentId }, { $set: { childIds } });
}

function toRecord(
  doc: HistoryDoc & {
    createdAt?: Date | string;
    providerMetadata?: Record<string, unknown> | null;
    variants?: Partial<Record<HistoryVariantKind, HistoryVariant>> | null;
    parentId?: string | null;
    parentRole?: HistoryParentRole | null;
    quadrantIndex?: number | null;
    childIds?: string[] | null;
    durationMs?: number | null;
  },
): HistoryRecord {
  const createdAt =
    doc.createdAt instanceof Date
      ? doc.createdAt.toISOString()
      : (doc.createdAt as string) ?? new Date().toISOString();
  return {
    id: doc._id,
    providerId: doc.providerId,
    prompt: doc.prompt,
    imageFilename: doc.imageFilename,
    mimeType: doc.mimeType,
    inputTokens: doc.inputTokens,
    outputTokens: doc.outputTokens,
    totalTokens: doc.totalTokens,
    rawUsage: doc.rawUsage,
    providerMetadata: doc.providerMetadata ?? null,
    variants: doc.variants ?? null,
    parentId: doc.parentId ?? null,
    parentRole: doc.parentRole ?? null,
    quadrantIndex: doc.quadrantIndex ?? null,
    childIds: doc.childIds ?? null,
    durationMs: typeof doc.durationMs === "number" ? doc.durationMs : null,
    createdAt,
  };
}
