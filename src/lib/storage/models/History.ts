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
     * (e.g. "transparent" for an SVG with the background primer stripped,
     * "vector" for a PNG → SVG trace of a quadrant).
     */
    variants: { type: Schema.Types.Mixed, default: null },

    /**
     * Parent linkage for post-processed children. Quadrants are first-class
     * History rows because they are distinct images, not alternates of the
     * parent. `parentRole` discriminates the kind of relationship.
     */
    parentId: { type: String, default: null, index: true },
    parentRole: {
      type: String,
      enum: [null, "quadrant"],
      default: null,
    },
    quadrantIndex: { type: Number, min: 0, max: 3, default: null },
    /**
     * Denormalized pointer from a parent to its 4 quadrant children. Lets the
     * detail page check "do quadrants exist?" without a secondary find().
     */
    childIds: { type: [String], default: undefined },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    _id: false,
  },
);

HistorySchema.index({ createdAt: -1 });
HistorySchema.index({ parentId: 1, quadrantIndex: 1 });
HistorySchema.index({ parentId: 1, createdAt: -1 });

export type HistoryDoc = InferSchemaType<typeof HistorySchema> & {
  _id: string;
};

export const History: Model<HistoryDoc> =
  (models.History as Model<HistoryDoc>) ??
  model<HistoryDoc>("History", HistorySchema);
