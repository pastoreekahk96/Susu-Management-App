import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { createSession, hashPassword, verifyPassword } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
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
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await createSession(user.id);

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
