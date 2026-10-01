import { requireRole } from "../../../lib/auth";
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

const MAX_REASON_LENGTH = 500;

function isValidMethod(value: unknown): value is "RANDOM" | "MANUAL" {
  return value === "RANDOM" || value === "MANUAL";
}

export async function GET() {
  try {
    const cycle = await prisma.cycle.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, weeklyPayoutAmount: true },
    });

    if (!cycle) {
      return NextResponse.json({ weeks: [], members: [] });
    }

    const [weeks, members] = await Promise.all([
      prisma.week.findMany({
        where: { cycleId: cycle.id, status: "ELIGIBLE" },
        orderBy: { weekNumber: "asc" },
        select: {
          id: true,
          weekNumber: true,
          startDate: true,
          endDate: true,
        },
      }),
      prisma.cycleMember.findMany({
        where: { cycleId: cycle.id },
        orderBy: { nameSnapshot: "asc" },
        select: {
          id: true,
          nameSnapshot: true,
          hands: {
            where: { status: "PENDING" },
            select: { id: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      weeks: weeks.map((week) => ({
        id: week.id,
        weekNumber: week.weekNumber,
        startDate: week.startDate.toISOString().slice(0, 10),
        endDate: week.endDate.toISOString().slice(0, 10),
        amount: cycle.weeklyPayoutAmount,
      })),
      members: members.map((member) => ({
        id: member.id,
        name: member.nameSnapshot,
        pendingHands: member.hands.length,
      })),
    });
  } catch (error) {
    console.error("Failed to load payout options", error);
    return NextResponse.json(
      { error: "Unable to load payout options." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole("ADMIN");
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "You are not authorized to perform this action." }, { status: 403 });
    return NextResponse.json({ error: "Authentication check failed." }, { status: 500 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const weekId = typeof body.weekId === "string" ? body.weekId.trim() : "";
    const method = body.method;
    const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
    const manualReason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    if (!weekId) {
      return NextResponse.json({ error: "Week ID is required." }, { status: 400 });
    }

    if (!isValidMethod(method)) {
      return NextResponse.json(
        { error: "Payout method must be RANDOM or MANUAL." },
        { status: 400 }
      );
    }

    if (method === "MANUAL") {
      if (!memberId) {
        return NextResponse.json(
          { error: "A member is required for a manual payout." },
          { status: 400 }
        );
      }

      if (!manualReason) {
        return NextResponse.json(
          { error: "A reason is required for a manual payout." },
          { status: 400 }
        );
      }

      if (manualReason.length > MAX_REASON_LENGTH) {
        return NextResponse.json(
          { error: `Manual payout reason cannot exceed ${MAX_REASON_LENGTH} characters.` },
          { status: 400 }
        );
      }
    }

    if (method === "RANDOM" && (memberId || manualReason)) {
      return NextResponse.json(
        { error: "Member and reason are only allowed for manual payouts." },
        { status: 400 }
      );
    }

    const activeCycle = await prisma.cycle.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        weeklyPayoutAmount: true,
      },
    });

    if (!activeCycle) {
      return NextResponse.json(
        { error: "There is no active SUSU cycle." },
        { status: 409 }
      );
    }

    const week = await prisma.week.findFirst({
      where: {
        id: weekId,
        cycleId: activeCycle.id,
      },
      select: {
        id: true,
        weekNumber: true,
        status: true,
      },
    });

    if (!week) {
      return NextResponse.json(
        { error: "Week was not found in the active cycle." },
        { status: 404 }
      );
    }

    if (week.status !== "ELIGIBLE") {
      return NextResponse.json(
        {
          error:
            week.status === "OPEN"
              ? "This week is not payout-eligible yet. Complete the week first."
              : "This week has already been paid.",
        },
        { status: 409 }
      );
    }

    const payout = await prisma.$transaction(async (tx) => {
      const lockedWeek = await tx.week.findFirst({
        where: {
          id: weekId,
          cycleId: activeCycle.id,
          status: "ELIGIBLE",
        },
        select: {
          id: true,
          weekNumber: true,
        },
      });

      if (!lockedWeek) {
        throw new Error("WEEK_NOT_ELIGIBLE");
      }

      const existingPayout = await tx.payout.findUnique({
        where: { weekId },
        select: { id: true },
      });

      if (existingPayout) {
        throw new Error("PAYOUT_ALREADY_EXISTS");
      }

      const pendingWhere = {
        cycleId: activeCycle.id,
        status: "PENDING" as const,
        ...(method === "MANUAL"
          ? { cycleMemberId: memberId }
          : {}),
      };

      const pendingHands = await tx.cycleHand.findMany({
        where: pendingWhere,
        select: {
          id: true,
          handNumber: true,
          cycleMemberId: true,
          cycleMember: {
            select: {
              id: true,
              nameSnapshot: true,
            },
          },
        },
      });

      if (pendingHands.length === 0) {
        throw new Error(
          method === "MANUAL" ? "MEMBER_HAS_NO_PENDING_HAND" : "NO_PENDING_HANDS"
        );
      }

      const selected = pendingHands[randomInt(pendingHands.length)];

      const marked = await tx.cycleHand.updateMany({
        where: {
          id: selected.id,
          cycleId: activeCycle.id,
          status: "PENDING",
        },
        data: {
          status: "SELECTED",
        },
      });

      if (marked.count !== 1) {
        throw new Error("HAND_ALREADY_SELECTED");
      }

      const result = await tx.payout.create({
        data: {
          weekId: lockedWeek.id,
          handId: selected.id,
          amount: activeCycle.weeklyPayoutAmount,
          selectionMethod: method,
          manualReason: method === "MANUAL" ? manualReason : null,
          status: "DRAWN",
          recordedById: actor.id,
        },
        include: {
          hand: {
            include: {
              cycleMember: {
                select: {
                  nameSnapshot: true,
                },
              },
            },
          },
        },
      });

      const updatedWeek = await tx.week.updateMany({
        where: {
          id: lockedWeek.id,
          status: "ELIGIBLE",
        },
        data: {
          status: "PAID",
        },
      });

      if (updatedWeek.count !== 1) {
        throw new Error("WEEK_ALREADY_CHANGED");
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: method === "RANDOM" ? "RANDOM_PAYOUT" : "MANUAL_PAYOUT",
          entityType: "Payout",
          entityId: result.id,
          beforeJson: JSON.stringify({
            weekId: lockedWeek.id,
            weekNumber: lockedWeek.weekNumber,
            weekStatus: "ELIGIBLE",
          }),
          afterJson: JSON.stringify({
            payoutId: result.id,
            handId: result.handId,
            handNumber: result.hand.handNumber,
            memberName: result.hand.cycleMember.nameSnapshot,
            amount: result.amount,
            selectionMethod: result.selectionMethod,
            manualReason: result.manualReason,
            weekStatus: "PAID",
          }),
        },
      });

      return result;
    });

    return NextResponse.json({
      id: payout.id,
      weekId: payout.weekId,
      weekNumber: week.weekNumber,
      handId: payout.handId,
      handNumber: payout.hand.handNumber,
      memberName: payout.hand.cycleMember.nameSnapshot,
      amount: payout.amount,
      selectionMethod: payout.selectionMethod,
      manualReason: payout.manualReason,
      status: payout.status,
      drawnAt: payout.drawnAt,
    });
  } catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, { error: string; status: number }> = {
        WEEK_NOT_ELIGIBLE: {
          error: "This week is no longer payout-eligible.",
          status: 409,
        },
        PAYOUT_ALREADY_EXISTS: {
          error: "A payout already exists for this week.",
          status: 409,
        },
        MEMBER_HAS_NO_PENDING_HAND: {
          error: "The selected member has no remaining pending hands.",
          status: 409,
        },
        NO_PENDING_HANDS: {
          error: "There are no remaining pending hands in this cycle.",
          status: 409,
        },
        HAND_ALREADY_SELECTED: {
          error: "The selected hand was already selected by another request. Please try again.",
          status: 409,
        },
        WEEK_ALREADY_CHANGED: {
          error: "The week changed while the payout was being recorded. No payout was completed.",
          status: 409,
        },
      };

      const known = messages[error.message];
      if (known) {
        return NextResponse.json(known, { status: known.status });
      }
    }

    console.error("Failed to record payout", error);
    return NextResponse.json(
      { error: "Unable to record the payout." },
      { status: 500 }
    );
  }
}
