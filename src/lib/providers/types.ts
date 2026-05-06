export type ProviderId = "gemini-nano-banana-2" | "recraft";

export interface GenerateInput {
  prompt: string;
  options?: Record<string, string>;
  /** Pre-fetched system prompt content. Providers that support it apply it as
   *  a system instruction separate from the user prompt. */
  systemPrompt?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  raw: unknown;
}

export interface GenerateOutput {
  imageBytes: Buffer;
  mimeType: string;
  usage: TokenUsage;
  providerMetadata: Record<string, unknown>;
}

export interface ProviderOptionChoice {
  value: string;
  label: string;
  /** Optional descriptive text shown to the user (e.g. model strengths). */
  description?: string;
}

export type ProviderOptionFieldType = "select" | "text";

export interface ProviderOptionField {
  id: string;
  label: string;
  defaultValue: string;
  /** "select" (default) for a dropdown, "text" for a free-text input. */
  type?: ProviderOptionFieldType;
  /** Placeholder for `type: "text"`. */
  placeholder?: string;
  /** Max length for `type: "text"`. */
  maxLength?: number;
  /** Static choices for an independent select. */
  choices?: ProviderOptionChoice[];
  /** Field id this field depends on. */
  dependsOn?: string;
  /** Per-parent-value choice list (select only). */
  choicesByValue?: Record<string, ProviderOptionChoice[]>;
  /** Per-parent-value default override. */
  defaultsByValue?: Record<string, string>;
  /**
   * Visibility gate (for any type). If `dependsOn` is set and the parent's
   * current value is not in this list, the field is hidden. For select fields,
   * if this is undefined the gate falls back to "visible iff `choicesByValue`
   * has an entry for the parent value".
   */
  visibleWhenParentIn?: string[];
  /**
   * Hide this field when the provider's resolved `outputFormat` rule indicates
   * a vector output (i.e. label contains "SVG"). Used for fields that only
   * make sense for raster output, e.g. `output_format`.
   */
  hideForVectorOutput?: boolean;
}

export interface OutputFormatHint {
  /**
   * Rules evaluated in order. The first rule whose `optionId` value equals
   * the user's currently-selected value wins. Rules let providers say
   * "if style=vector_illustration, the output is SVG".
   */
  rules: Array<{
    optionId: string;
    valueIs: string;
    label: string;
  }>;
  /** Used when no rule matches (or when the provider has no options). */
  defaultLabel: string;
}

export interface ProviderBalance {
  /** Current account credit/unit balance. */
  credits: number;
  /** Verbatim provider response. */
  raw: unknown;
}

export interface ImageProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly optionFields: ProviderOptionField[];
  readonly outputFormat: OutputFormatHint;
  generate(input: GenerateInput): Promise<GenerateOutput>;
  /** Optional: live balance check from the provider's account endpoint. */
  fetchBalance?(): Promise<ProviderBalance>;
}
