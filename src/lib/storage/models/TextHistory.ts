import "server-only";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const TextHistorySchema = new Schema(
  {
    _id: { type: String, required: true },
    /** "gemini-text" | "claude-cli" — kept as a free string so providers
     *  can be added without a schema migration. */
    providerId: { type: String, required: true, index: true },
    prompt: { type: String, required: true },
    output: { type: String, required: true },
    /** Wall-clock duration of the provider call, in milliseconds. */
    durationMs: { type: Number, required: true, min: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    _id: false,
  },
);

TextHistorySchema.index({ createdAt: -1 });

export type TextHistoryDoc = InferSchemaType<typeof TextHistorySchema> & {
  _id: string;
};

export const TextHistory: Model<TextHistoryDoc> =
  (models.TextHistory as Model<TextHistoryDoc>) ??
  model<TextHistoryDoc>("TextHistory", TextHistorySchema);
