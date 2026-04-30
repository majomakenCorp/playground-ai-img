import "server-only";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const GenerationSchema = new Schema(
  {
    systemPromptId: { type: String, required: true },
    output: { type: String, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const BrandBriefSchema = new Schema(
  {
    _id: { type: String, required: true },
    brandName: { type: String, required: true },
    formData: { type: Schema.Types.Mixed, required: true },
    generations: { type: [GenerationSchema], default: [] },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false,
    _id: false,
  },
);

BrandBriefSchema.index({ createdAt: -1 });

export type BrandBriefDoc = InferSchemaType<typeof BrandBriefSchema> & {
  _id: string;
};

export const BrandBrief: Model<BrandBriefDoc> =
  (models.BrandBrief as Model<BrandBriefDoc>) ??
  model<BrandBriefDoc>("BrandBrief", BrandBriefSchema);
