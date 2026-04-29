import "server-only";
import { connectMongo } from "@/lib/storage/mongo";
import { History, type HistoryDoc } from "@/lib/storage/models/History";

export interface HistoryVariant {
  filename: string;
  mimeType: string;
  createdAt: string;
}

export type HistoryVariantKind = "transparent";

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
  });
  return toRecord(doc.toObject());
}

export async function listHistory(args: {
  limit: number;
  before?: Date;
}): Promise<HistoryRecord[]> {
  await connectMongo();
  const filter = args.before ? { createdAt: { $lt: args.before } } : {};
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
}

interface AggregateRow {
  _id: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  firstAt: Date | null;
  lastAt: Date | null;
}

export async function aggregateUsage(): Promise<UsageTotal[]> {
  await connectMongo();
  const rows = await History.aggregate<AggregateRow>([
    {
      $group: {
        _id: "$providerId",
        count: { $sum: 1 },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        totalTokens: { $sum: "$totalTokens" },
        firstAt: { $min: "$createdAt" },
        lastAt: { $max: "$createdAt" },
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
  }));
}

export async function getHistory(id: string): Promise<HistoryRecord | null> {
  await connectMongo();
  const doc = await History.findById(id).lean();
  return doc ? toRecord(doc) : null;
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

function toRecord(
  doc: HistoryDoc & {
    createdAt?: Date | string;
    providerMetadata?: Record<string, unknown> | null;
    variants?: Partial<Record<HistoryVariantKind, HistoryVariant>> | null;
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
    createdAt,
  };
}
