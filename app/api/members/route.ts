import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getCurrentUser, requireRole } from "../../../lib/auth";
import { validateSameOrigin } from "../../../lib/security";

const MAX_NAME_LENGTH = 120;

function validateName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

function authError(error: unknown) {
  if (error instanceof Error && error.message === "AUTH_REQUIRED") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const cycle = await prisma.cycle.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  const members = await prisma.member.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      cycleMembers: cycle
        ? { where: { cycleId: cycle.id }, select: { handsCount: true } }
        : false,
    },
  });

  return NextResponse.json({
    cycle: cycle ? { id: cycle.id, name: cycle.name } : null,
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      active: member.active,
      createdAt: member.createdAt,
      currentCycleHands:
        cycle && Array.isArray(member.cycleMembers)
          ? member.cycleMembers[0]?.handsCount ?? 0
          : 0,
      inCurrentCycle:
        cycle && Array.isArray(member.cycleMembers) ? member.cycleMembers.length > 0 : false,
    })),
  });
}

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }

  try {
    const actor = await requireRole("ADMIN");
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const name = validateName(body.name);
    if (!name) {
      return NextResponse.json(
        { error: "Member name is required and must be 120 characters or fewer." },
        { status: 400 }
      );
    }

    const member = await prisma.$transaction(async (tx) => {
      const existing = await tx.member.findUnique({ where: { name } });
      if (existing) throw new Error("MEMBER_EXISTS");

      const created = await tx.member.create({ data: { name, active: true } });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "MEMBER_CREATED",
          entityType: "Member",
          entityId: created.id,
          afterJson: JSON.stringify({ name: created.name, active: created.active }),
        },
      });

      return created;
    });

    return NextResponse.json(
      { member: { id: member.id, name: member.name, active: member.active } },
      { status: 201 }
    );
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.message === "MEMBER_EXISTS") {
      return NextResponse.json({ error: "A member with this name already exists." }, { status: 409 });
    }
    console.error("Member creation failed", error);
    return NextResponse.json({ error: "Unable to create member." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }

  try {
    const actor = await requireRole("ADMIN");
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Member id is required." }, { status: 400 });

    const existing = await prisma.member.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    const name = body.name === undefined ? existing.name : validateName(body.name);
    const active = body.active === undefined ? existing.active : body.active;

    if (!name) {
      return NextResponse.json(
        { error: "Member name is required and must be 120 characters or fewer." },
        { status: 400 }
      );
    }
    if (typeof active !== "boolean") {
      return NextResponse.json({ error: "Active status must be true or false." }, { status: 400 });
    }

    const member = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.member.findFirst({ where: { name, NOT: { id } } });
      if (duplicate) throw new Error("MEMBER_EXISTS");

      const updated = await tx.member.update({ where: { id }, data: { name, active } });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "MEMBER_UPDATED",
          entityType: "Member",
          entityId: updated.id,
          beforeJson: JSON.stringify({ name: existing.name, active: existing.active }),
          afterJson: JSON.stringify({ name: updated.name, active: updated.active }),
        },
      });

      return updated;
    });

    return NextResponse.json({
      member: { id: member.id, name: member.name, active: member.active },
    });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.message === "MEMBER_EXISTS") {
      return NextResponse.json({ error: "A member with this name already exists." }, { status: 409 });
    }
    console.error("Member update failed", error);
    return NextResponse.json({ error: "Unable to update member." }, { status: 500 });
  }
}
