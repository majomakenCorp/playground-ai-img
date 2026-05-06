import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const HEADER = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
// 10 years — single-tenant playground, no rotation needed.
const TEN_YEARS_S = 60 * 60 * 24 * 365 * 10;

export interface SessionPayload {
  sub: "playground";
  iat: number;
  exp: number;
}

export function signSession(
  partial: Pick<SessionPayload, "sub">,
  ttlSeconds: number = TEN_YEARS_S,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: partial.sub,
    iat: now,
    exp: now + ttlSeconds,
  };
  const body = base64url(JSON.stringify(payload));
  const signingInput = `${HEADER}.${body}`;
  const sig = sign(signingInput);
  return `${signingInput}.${sig}`;
}

export function verifySession(token: string): SessionPayload | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = sign(`${h}.${b}`);

  const a = Buffer.from(s);
  const e = Buffer.from(expected);
  if (a.length !== e.length) return null;
  if (!timingSafeEqual(a, e)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(
      Buffer.from(b.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    );
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as SessionPayload).sub !== "playground" ||
    typeof (payload as SessionPayload).exp !== "number"
  ) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if ((payload as SessionPayload).exp <= now) return null;

  return payload as SessionPayload;
}

function sign(input: string): string {
  return base64urlBuffer(
    createHmac("sha256", env.AUTH_SECRET).update(input).digest(),
  );
}

function base64url(s: string): string {
  return base64urlBuffer(Buffer.from(s, "utf8"));
}

function base64urlBuffer(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export const SESSION_COOKIE_NAME = "pg_session";
export const SESSION_TTL_SECONDS = TEN_YEARS_S;
