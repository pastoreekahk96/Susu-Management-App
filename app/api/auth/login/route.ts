import { NextResponse } from "next/server";
import { validateSameOrigin } from "../../../../lib/security";
import { prisma } from "../../../../lib/prisma";
import { createSession, hashPassword, verifyPassword } from "../../../../lib/auth";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;

function getLoginKey(request: Request, email: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip")?.trim() || "unknown";
  return `${ip}:${email}`;
}

async function isLoginBlocked(key: string) {
  const now = new Date();
  const attempt = await prisma.loginAttempt.findUnique({ where: { key } });

  if (!attempt) return false;

  if (attempt.blockedUntil && attempt.blockedUntil > now) return true;

  if (now.getTime() - attempt.windowStartedAt.getTime() >= RATE_LIMIT_WINDOW_MS) {
    await prisma.loginAttempt.update({
      where: { id: attempt.id },
      data: { attempts: 0, windowStartedAt: now, blockedUntil: null },
    });
  }

  return false;
}

async function recordFailedLogin(key: string) {
  for (let retry = 0; retry < 3; retry += 1) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const attempt = await tx.loginAttempt.findUnique({ where: { key } });

          if (!attempt || now.getTime() - attempt.windowStartedAt.getTime() >= RATE_LIMIT_WINDOW_MS) {
            await tx.loginAttempt.upsert({
              where: { key },
              create: { key, attempts: 1, windowStartedAt: now },
              update: { attempts: 1, windowStartedAt: now, blockedUntil: null },
            });
            return;
          }

          const attempts = attempt.attempts + 1;
          await tx.loginAttempt.update({
            where: { id: attempt.id },
            data: {
              attempts,
              blockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null,
            },
          });
        },
        { isolationLevel: "Serializable" }
      );
      return;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "P2034" && retry < 2) {
        continue;
      }
      throw error;
    }
  }
}

async function clearFailedLogins(key: string) {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const loginKey = getLoginKey(request, email);
    if (await isLoginBlocked(loginKey)) {
      return NextResponse.json(
        { error: "Too many failed sign-in attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(BLOCK_MS / 1000) } }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await recordFailedLogin(loginKey);
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    let passwordHash = user.passwordHash;

    if (!passwordHash && email === "admin@susu.local") {
      const bootstrapPassword = process.env.SUSU_ADMIN_PASSWORD;
      if (bootstrapPassword && bootstrapPassword === password) {
        passwordHash = hashPassword(password);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash },
        });
      }
    }

    if (!passwordHash || !verifyPassword(password, passwordHash)) {
      await recordFailedLogin(loginKey);
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await clearFailedLogins(loginKey);
    await createSession(user.id);

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
