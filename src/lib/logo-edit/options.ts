/**
 * Option vocabulary for the logo edit module. Kept free of `server-only` so
 * the Zod schema, the provider and the client form all read the same lists.
 */

export const EDIT_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
] as const;
export type EditModel = (typeof EDIT_MODELS)[number];

/** Glyph's production default: the GA id, not the capacity-limited preview. */
export const DEFAULT_EDIT_MODEL: EditModel = "gemini-3.1-flash-image";

export const EDIT_ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16"] as const;
export type EditAspectRatio = (typeof EDIT_ASPECT_RATIOS)[number];
export const DEFAULT_EDIT_ASPECT_RATIO: EditAspectRatio = "1:1";

export const EDIT_IMAGE_SIZES = ["1K", "2K", "4K"] as const;
export type EditImageSize = (typeof EDIT_IMAGE_SIZES)[number];
export const DEFAULT_EDIT_IMAGE_SIZE: EditImageSize = "1K";

/** 2.5 Flash rejects `imageConfig.imageSize` (fixed 1024px output). */
export const MODEL_SUPPORTS_IMAGE_SIZE: Record<EditModel, boolean> = {
  "gemini-3.1-flash-image": true,
  "gemini-3.1-flash-image-preview": true,
  "gemini-3-pro-image-preview": true,
  "gemini-2.5-flash-image": false,
};

export interface EditModelChoice {
  value: EditModel;
  label: string;
  description: string;
}

export const EDIT_MODEL_CHOICES: readonly EditModelChoice[] = [
  {
    value: "gemini-3.1-flash-image",
    label: "Nano Banana 2 (GA)",
    description: "Same model id glyph uses in production for logo edits.",
  },
  {
    value: "gemini-3.1-flash-image-preview",
    label: "Nano Banana 2 (preview)",
    description: "Preview alias; capacity-limited, prone to 503 under load.",
  },
  {
    value: "gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
    description: "Best quality, slowest; thinking always on.",
  },
  {
    value: "gemini-2.5-flash-image",
    label: "Nano Banana (2.5)",
    description: "Fastest; fixed 1024px output, image size is ignored.",
  },
];
