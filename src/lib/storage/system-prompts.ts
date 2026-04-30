import "server-only";
import { connectMongo } from "@/lib/storage/mongo";
import { SystemPrompt } from "@/lib/storage/models/SystemPrompt";
import { uuidV7 } from "@/lib/uuid";

export type SystemPromptRow = {
  id: string;
  title: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type RawDoc = {
  _id: string;
  title: string;
  name: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

function toRow(d: RawDoc): SystemPromptRow {
  return {
    id: d._id,
    title: d.title,
    name: d.name,
    content: d.content,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export async function listSystemPrompts(): Promise<SystemPromptRow[]> {
  await connectMongo();
  const docs = await SystemPrompt.find().sort({ updatedAt: -1 }).lean();
  return docs.map(toRow);
}

export async function getSystemPrompt(id: string): Promise<SystemPromptRow | null> {
  await connectMongo();
  const doc = await SystemPrompt.findById(id).lean();
  return doc ? toRow(doc) : null;
}

export async function createSystemPrompt(input: {
  title: string;
  name: string;
  content: string;
}): Promise<SystemPromptRow> {
  await connectMongo();
  const id = uuidV7();
  const doc = await SystemPrompt.create({ _id: id, ...input });
  return toRow(doc.toObject());
}

export async function updateSystemPrompt(
  id: string,
  patch: { title?: string; name?: string; content?: string },
): Promise<SystemPromptRow | null> {
  await connectMongo();
  const doc = await SystemPrompt.findByIdAndUpdate(id, patch, { new: true }).lean();
  return doc ? toRow(doc) : null;
}

export async function deleteSystemPrompt(id: string): Promise<boolean> {
  await connectMongo();
  const res = await SystemPrompt.findByIdAndDelete(id).lean();
  return res !== null;
}
