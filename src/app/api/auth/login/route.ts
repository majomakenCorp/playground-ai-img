import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSession,
} from "@/lib/auth/jwt";
import { isAllowedOrigin } from "@/lib/auth/origin";
import { clientIpFrom, rateLimit } from "@/lib/auth/rateLimit";
import { LoginSchema } from "@/lib/validation/schemas";

const FIFTEEN_MIN = 15 * 60 * 1000;

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ip = clientIpFrom(req);
  const limited = rateLimit(`login:${ip}`, 5, FIFTEEN_MIN);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "too_many_requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const submitted = Buffer.from(parsed.data.password);
  const expected = Buffer.from(env.APP_PASSWORD);
  const ok =
    submitted.length === expected.length && timingSafeEqual(submitted, expected);

  if (!ok) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = signSession({ sub: "playground" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
