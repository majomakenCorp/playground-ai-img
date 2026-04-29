import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  verifySession,
  type SessionPayload,
} from "@/lib/auth/jwt";

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifySession(raw);
}
