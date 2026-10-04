import { requireRole } from "../../../../lib/auth";
import { NextResponse } from "next/server";
import { validateSameOrigin } from "../../../../lib/security";
import { prisma } from "../../../../lib/prisma";

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  let actorId: string | null = null;

  try {
    const actor = await requireRole("ADMIN");
    actorId = actor.id;
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You are not authorized to perform this action." }, { status: 403 });
    return NextResponse.json({ error: "Authentication check failed." }, { status: 500 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const weekId = typeof body.weekId === "string" ? body.weekId.trim() : "";

    if (!weekId) {
      return NextResponse.json({ error: "Week ID is required." }, { status: 400 });
    }

    const activeCycle = await prisma.cycle.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, daysPerWeek: true },
    });

    if (!activeCycle) {
      return NextResponse.json({ error: "There is no active SUSU cycle." }, { status: 409 });
    }

    const week = await prisma.week.findFirst({
      where: { id: weekId, cycleId: activeCycle.id },
    });

    if (!week) {
      return NextResponse.json({ error: "Week was not found in the active cycle." }, { status: 404 });
    }

    if (week.status !== "OPEN") {
      return NextResponse.json(
        { error: "Week is already " + week.status.toLowerCase() + " and cannot be completed again." },
        { status: 409 }
      );
    }

    const today = startOfUtcDay(new Date());
    const completionDate = addDays(startOfUtcDay(week.endDate), 1);

    if (today < completionDate) {
      return NextResponse.json(
        { error: "This week cannot be completed until the Sunday contribution day has ended." },
        { status: 409 }
      );
    }

    const memberCount = await prisma.cycleMember.count({ where: { cycleId: activeCycle.id } });
    const paymentCount = await prisma.dailyPayment.count({ where: { weekId } });
    const incompleteCount = await prisma.dailyPayment.count({
      where: {
        weekId,
        status: { not: "PAID" },
      },
    });

    const expectedPaymentCount = memberCount * activeCycle.daysPerWeek;

    if (paymentCount !== expectedPaymentCount || incompleteCount > 0) {
      return NextResponse.json(
        {
          error: "Week is not ready. Every member must have a fully paid record for all contribution days.",
          memberCount,
          expectedPaymentCount,
          paymentCount,
          incompleteCount,
        },
        { status: 409 }
      );
    }

    const updatedWeek = await prisma.$transaction(async (tx) => {
      const lockedWeek = await tx.week.findFirst({
        where: {
          id: weekId,
          cycleId: activeCycle.id,
          status: "OPEN",
        },
      });

      if (!lockedWeek) {
        throw new Error("WEEK_CLOSED_OR_MISSING");
      }

      const lockedMemberCount = await tx.cycleMember.count({ where: { cycleId: activeCycle.id } });
      const lockedPaymentCount = await tx.dailyPayment.count({ where: { weekId } });
      const lockedIncompleteCount = await tx.dailyPayment.count({
        where: { weekId, status: { not: "PAID" } },
      });

      if (
        lockedPaymentCount !== lockedMemberCount * activeCycle.daysPerWeek ||
        lockedIncompleteCount > 0
      ) {
        throw new Error("WEEK_NOT_READY");
      }

      const result = await tx.week.update({
        where: { id: weekId },
        data: { status: "ELIGIBLE" },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "COMPLETE_WEEK",
          entityType: "Week",
          entityId: weekId,
          beforeJson: JSON.stringify({ status: "OPEN" }),
          afterJson: JSON.stringify({
            status: "ELIGIBLE",
            weekNumber: result.weekNumber,
          }),
        },
      });

      return result;
    });

    return NextResponse.json({
      id: updatedWeek.id,
      weekNumber: updatedWeek.weekNumber,
      status: updatedWeek.status,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "WEEK_CLOSED_OR_MISSING") {
        return NextResponse.json({ error: "This week has already been completed or changed." }, { status: 409 });
      }

      if (error.message === "WEEK_NOT_READY") {
        return NextResponse.json(
          { error: "Week is not ready. Every member must have fully paid records for all contribution days." },
          { status: 409 }
        );
      }
    }

    console.error("Failed to complete week", error);
    return NextResponse.json({ error: "Unable to complete the week." }, { status: 500 });
  }
}
