import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "@prisma/client";
import { prisma } from "@/server/db";

const COOKIE = "orchid_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return new TextEncoder().encode(s);
}

/** Create a DB session for the user and set the signed, httpOnly session cookie. */
export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + MAX_AGE_MS);
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  const jwt = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Return the signed-in user, or null if there is no valid, unexpired session. */
export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const sid = typeof payload.sid === "string" ? payload.sid : null;
    if (!sid) return null;
    const session = await prisma.session.findUnique({ where: { id: sid }, include: { user: true } });
    if (!session || session.expiresAt < new Date()) return null;
    return session.user;
  } catch {
    return null;
  }
}

/** Delete the current session (DB row + cookie). */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      if (typeof payload.sid === "string") {
        await prisma.session.delete({ where: { id: payload.sid } }).catch(() => {});
      }
    } catch {
      // ignore invalid token
    }
  }
  jar.delete(COOKIE);
}
