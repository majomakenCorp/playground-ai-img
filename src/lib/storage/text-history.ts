import "server-only";
import { connectMongo } from "@/lib/storage/mongo";
import { TextHistory } from "@/lib/storage/models/TextHistory";
import { uuidV7 } from "@/lib/uuid";

export type TextHistoryRow = {
  id: string;
  providerId: string;
  prompt: string;
  output: string;
  durationMs: number;
  createdAt: string;
};

type RawDoc = {
  _id: string;
  providerId: string;
  prompt: string;
  output: string;
  durationMs: number;
  createdAt: Date;
};

function toRow(d: RawDoc): TextHistoryRow {
  return {
    id: d._id,
    providerId: d.providerId,
    prompt: d.prompt,
    output: d.output,
    durationMs: d.durationMs,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function createTextHistoryEntry(input: {
  providerId: string;
  prompt: string;
  output: string;
  durationMs: number;
}): Promise<TextHistoryRow> {
  await connectMongo();
  const id = uuidV7();
  const doc = await TextHistory.create({ _id: id, ...input });
  return toRow(doc.toObject());
}

export async function listTextHistory({
  limit = 50,
  before,
}: { limit?: number; before?: Date } = {}): Promise<TextHistoryRow[]> {
  await connectMongo();
  const query = before ? { createdAt: { $lt: before } } : {};
  const docs = await TextHistory.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return docs.map(toRow);
}

export async function getTextHistoryEntry(
  id: string,
): Promise<TextHistoryRow | null> {
  await connectMongo();
  const doc = await TextHistory.findById(id).lean();
  return doc ? toRow(doc) : null;
}
