import type { GroupRole, PrismaClient } from "@prisma/client";

type Authorize = (groupId: string, role: GroupRole) => Promise<{ groupId: string }>;
type Context = { params: Promise<{ groupId: string }> };
type Database = Pick<PrismaClient, "cycle" | "week" | "cycleMember">;
const headers = { "Cache-Control": "private, no-store" };

export function createGroupPayoutOptionsReader(db: Database, authorize: Authorize) {
  return async (groupId: string) => {
    const actor = await authorize(groupId, "ADMIN");
    const cycle = await db.cycle.findFirst({
      where: { groupId: actor.groupId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, weeklyPayoutAmount: true },
    });
    if (!cycle) return { weeks: [], members: [] };
    const [weeks, members] = await Promise.all([
      db.week.findMany({
        where: { cycleId: cycle.id, cycle: { groupId: actor.groupId, status: "ACTIVE" }, status: "ELIGIBLE", payout: null },
        orderBy: { weekNumber: "asc" },
        select: { id: true, weekNumber: true, startDate: true, endDate: true },
      }),
      db.cycleMember.findMany({
        where: { cycleId: cycle.id, cycle: { groupId: actor.groupId, status: "ACTIVE" } },
        orderBy: { nameSnapshot: "asc" },
        select: { id: true, nameSnapshot: true, hands: {
          where: { cycleId: cycle.id, cycle: { groupId: actor.groupId, status: "ACTIVE" }, status: "PENDING", payout: null },
          select: { id: true },
        } },
      }),
    ]);
    return {
      weeks: weeks.map(week => ({ ...week, startDate: week.startDate.toISOString().slice(0, 10),
        endDate: week.endDate.toISOString().slice(0, 10), amount: cycle.weeklyPayoutAmount })),
      members: members.map(member => ({ id: member.id, name: member.nameSnapshot, pendingHands: member.hands.length })),
    };
  };
}

export function createGroupPayoutOptionsHandler(db: Database, authorize: Authorize) {
  const read = createGroupPayoutOptionsReader(db, authorize);
  return async (_request: Request, { params }: Context) => {
    try {
      return Response.json(await read((await params).groupId), { headers });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "AUTH_REQUIRED") return Response.json({ error: "Authentication required." }, { status: 401, headers });
      if (code === "FORBIDDEN") return Response.json({ error: "Group administrator access required." }, { status: 403, headers });
      console.error("Group payout options read failed");
      return Response.json({ error: "Unable to load group payout options." }, { status: 500, headers });
    }
  };
}
