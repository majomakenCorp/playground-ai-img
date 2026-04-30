import "server-only";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const SystemPromptSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    name: { type: String, required: true, index: true },
    content: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false,
    _id: false,
  },
);

SystemPromptSchema.index({ updatedAt: -1 });

export type SystemPromptDoc = InferSchemaType<typeof SystemPromptSchema> & {
  _id: string;
};

export const SystemPrompt: Model<SystemPromptDoc> =
  (models.SystemPrompt as Model<SystemPromptDoc>) ??
  model<SystemPromptDoc>("SystemPrompt", SystemPromptSchema);
