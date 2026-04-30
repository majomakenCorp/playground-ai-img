import "server-only";
import { connectMongo } from "@/lib/storage/mongo";
import { BrandBrief } from "@/lib/storage/models/BrandBrief";
import { uuidV7 } from "@/lib/uuid";
import type { BrandBriefForm } from "@/lib/validation/schemas";

export type BriefGeneration = {
  systemPromptId: string;
  output: string;
  createdAt: string;
};

export type BrandBriefRow = {
  id: string;
  brandName: string;
  formData: BrandBriefForm;
  generations: BriefGeneration[];
  createdAt: string;
  updatedAt: string;
};

type RawGen = {
  systemPromptId: string;
  output: string;
  createdAt: Date;
};

type RawDoc = {
  _id: string;
  brandName: string;
  formData: unknown;
  generations?: RawGen[];
  createdAt: Date;
  updatedAt: Date;
};

function toRow(doc: RawDoc): BrandBriefRow {
  return {
    id: doc._id,
    brandName: doc.brandName,
    formData: doc.formData as BrandBriefForm,
    generations: (doc.generations ?? []).map((g) => ({
      systemPromptId: g.systemPromptId,
      output: g.output,
      createdAt: g.createdAt.toISOString(),
    })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function createBrief(formData: BrandBriefForm): Promise<BrandBriefRow> {
  await connectMongo();
  const id = uuidV7();
  const doc = await BrandBrief.create({
    _id: id,
    brandName: formData.basics.brandName,
    formData,
  });
  return toRow(doc.toObject());
}

export async function getBrief(id: string): Promise<BrandBriefRow | null> {
  await connectMongo();
  const doc = await BrandBrief.findById(id).lean();
  return doc ? toRow(doc) : null;
}

export async function listBriefs(limit = 100): Promise<BrandBriefRow[]> {
  await connectMongo();
  const docs = await BrandBrief.find().sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map(toRow);
}

export async function appendBriefGeneration(
  id: string,
  systemPromptId: string,
  output: string,
): Promise<BrandBriefRow | null> {
  await connectMongo();
  const doc = await BrandBrief.findByIdAndUpdate(
    id,
    {
      $push: {
        generations: { systemPromptId, output, createdAt: new Date() },
      },
    },
    { new: true },
  ).lean();
  return doc ? toRow(doc) : null;
}
