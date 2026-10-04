import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const SESSION_COOKIE = "susu_session";
const SESSION_DAYS = 7;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string) {
  const [, salt, expectedHex] = stored.split("$");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  const previousToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (previousToken) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(previousToken) },
    });
  }

  const now = new Date();
  await prisma.session.deleteMany({
    where: { expiresAt: { lte: now } },
  });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: randomUUID(),
      tokenHash,
      userId,
      expiresAt,
    },
  });

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return session.user;
}

export async function requireRole(role: "ADMIN" | "OPERATOR" | "VIEWER" = "OPERATOR") {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  const allowed =
    role === "VIEWER"
      ? true
      : role === "OPERATOR"
        ? user.role === "ADMIN" || user.role === "OPERATOR"
        : user.role === "ADMIN";

  if (!allowed) {
    throw new Error("FORBIDDEN");
  }

  return user;
}
