import "server-only";
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const HistorySchema = new Schema(
  {
    _id: { type: String, required: true },
    providerId: { type: String, required: true, index: true },
    prompt: { type: String, required: true },
    imageFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
    inputTokens: { type: Number, required: true, min: 0 },
    outputTokens: { type: Number, required: true, min: 0 },
    totalTokens: { type: Number, required: true, min: 0 },
    rawUsage: { type: Schema.Types.Mixed, required: true },
    providerMetadata: { type: Schema.Types.Mixed, default: null },
    /**
     * Post-processed alternates of the same image. Keyed by variant kind
     * (e.g. "transparent" for an SVG with the background primer stripped).
     */
    variants: { type: Schema.Types.Mixed, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    _id: false,
  },
);

HistorySchema.index({ createdAt: -1 });

export type HistoryDoc = InferSchemaType<typeof HistorySchema> & {
  _id: string;
};

export const History: Model<HistoryDoc> =
  (models.History as Model<HistoryDoc>) ??
  model<HistoryDoc>("History", HistorySchema);
