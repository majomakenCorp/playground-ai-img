export type ProviderErrorKind =
  | "auth"
  | "rate_limit"
  | "invalid_request"
  | "upstream"
  | "timeout";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly providerId: string;
  readonly upstream: unknown;

  constructor(args: {
    kind: ProviderErrorKind;
    providerId: string;
    message: string;
    upstream?: unknown;
  }) {
    super(args.message);
    this.name = "ProviderError";
    this.kind = args.kind;
    this.providerId = args.providerId;
    this.upstream = args.upstream;
  }
}

export function httpStatusFor(kind: ProviderErrorKind): number {
  switch (kind) {
    case "auth":
      return 502;
    case "rate_limit":
      return 429;
    case "invalid_request":
      return 400;
    case "timeout":
      return 504;
    case "upstream":
    default:
      return 502;
  }
}
