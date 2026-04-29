import "server-only";
import { env } from "@/lib/env";

export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const allowed = env.APP_ORIGIN;

  if (origin) return origin === allowed;
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}` === allowed;
    } catch {
      return false;
    }
  }
  return false;
}
