import type { GroupRole, PrismaClient } from "@prisma/client";
import { validateSameOrigin } from "./security";

type Authorize = (groupId: string, role: GroupRole) => Promise<{ userId: string; groupId: string }>;
type Context = { params: Promise<{ groupId: string }> };
const day = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

export function createGroupWeekCompleter(
  db: PrismaClient,
  authorize: Authorize,
  getSessionTokenHash: () => Promise<string | null>,
  now: () => Date = () => new Date(),
) {
  return async (request: Request, { params }: Context) => {
    if (!validateSameOrigin(request)) return Response.json({ error: "Cross-origin request blocked." }, { status: 403 });
    try {
      const actor = await authorize((await params).groupId, "ADMIN");
      const tokenHash = await getSessionTokenHash();
      if (!tokenHash) throw new Error("AUTH_REQUIRED");
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "weekId") ||
        typeof body.weekId !== "string" || !body.weekId.trim()) {
        return Response.json({ error: "Only a valid week ID is accepted." }, { status: 400 });
      }
      const weekId = body.weekId.trim();
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const updated = await db.$transaction(async tx => {
            const currentTime = now();
            const session = await tx.session.findFirst({ where: {
              tokenHash, userId: actor.userId, expiresAt: { gt: currentTime },
            }, select: { id: true } });
            if (!session) throw new Error("AUTH_REQUIRED");
            const membership = await tx.groupMembership.findFirst({ where: {
              userId: actor.userId, groupId: actor.groupId, role: { in: ["OWNER", "ADMIN"] },
            }, select: { id: true } });
            if (!membership) throw new Error("FORBIDDEN");
            const week = await tx.week.findFirst({ where: { id: weekId, cycle: { groupId: actor.groupId } },
              include: { cycle: true } });
            if (!week) throw new Error("WEEK_NOT_FOUND");
            if (week.status !== "OPEN" || week.cycle.status !== "ACTIVE") throw new Error("WEEK_CLOSED");
            // Preserve the existing UTC boundary: the end day must finish first.
            if (day(currentTime) < day(week.endDate) + 86400000) throw new Error("WEEK_TOO_EARLY");
            const members = await tx.cycleMember.findMany({ where: {
              cycleId: week.cycleId, cycle: { groupId: actor.groupId },
            }, select: { id: true } });
            // Read every record for this scoped week, so corrupt foreign snapshot
            // links cannot be hidden by filtering them out of the count.
            const payments = await tx.dailyPayment.findMany({ where: { weekId: week.id }, select: {
              cycleMemberId: true, dayIndex: true, expectedAmount: true, paidAmount: true, status: true,
              cycleMember: { select: { cycleId: true } },
            } });
            const days = week.cycle.daysPerWeek;
            const memberIds = new Set(members.map(member => member.id));
            const slots = new Set<string>();
            if (!members.length || !Number.isSafeInteger(days) || days < 1 || days > 7 || payments.length !== members.length * days) {
              throw new Error("WEEK_NOT_READY");
            }
            for (const payment of payments) {
              const slot = `${payment.cycleMemberId}:${payment.dayIndex}`;
              if (!memberIds.has(payment.cycleMemberId) || payment.cycleMember.cycleId !== week.cycleId ||
                !Number.isInteger(payment.dayIndex) || payment.dayIndex < 0 || payment.dayIndex >= days || slots.has(slot) ||
                payment.status !== "PAID" || !Number.isSafeInteger(payment.expectedAmount) || payment.expectedAmount <= 0 ||
                payment.paidAmount !== payment.expectedAmount) throw new Error("WEEK_NOT_READY");
              slots.add(slot);
            }
            const result = await tx.week.update({ where: { id: week.id }, data: { status: "ELIGIBLE" } });
            const scope = { groupId: actor.groupId, cycleId: week.cycleId, weekNumber: result.weekNumber };
            await tx.auditLog.create({ data: {
              actorId: actor.userId, action: "COMPLETE_WEEK", entityType: "Week", entityId: week.id,
              beforeJson: JSON.stringify({ ...scope, status: "OPEN" }),
              afterJson: JSON.stringify({ ...scope, status: "ELIGIBLE" }),
            } });
            return { id: result.id, weekNumber: result.weekNumber, status: result.status };
          }, { isolationLevel: "Serializable" });
          return Response.json(updated);
        } catch (error) {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034" && attempt < 2) continue;
          throw error;
        }
      }
      throw new Error("WEEK_COMPLETION_FAILED");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "AUTH_REQUIRED") return Response.json({ error: "Authentication required." }, { status: 401 });
      if (message === "FORBIDDEN") return Response.json({ error: "Group administrator access required." }, { status: 403 });
      if (message === "WEEK_NOT_FOUND") return Response.json({ error: "Week not found." }, { status: 404 });
      if (message === "WEEK_CLOSED") return Response.json({ error: "This week can no longer be completed." }, { status: 409 });
      if (message === "WEEK_TOO_EARLY") return Response.json({ error: "This week cannot be completed until the Sunday contribution day has ended." }, { status: 409 });
      if (message === "WEEK_NOT_READY") return Response.json({ error: "Every member must have fully paid records for all contribution days." }, { status: 409 });
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
        return Response.json({ error: "Concurrent change. Please retry." }, { status: 409 });
      }
      console.error("Group week completion failed");
      return Response.json({ error: "Unable to complete the week." }, { status: 500 });
    }
  };
}
