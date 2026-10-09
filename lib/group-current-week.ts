import type { GroupRole, PrismaClient } from "@prisma/client";

type WeekDates = { startDate: Date; endDate: Date };
const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

// Match the existing calendar behavior: first week before the cycle, last week after it.
export function selectCurrentWeek<T extends WeekDates>(weeks: T[], now: Date): T | null {
  const today = utcDay(now);
  return weeks.find(week => today >= utcDay(week.startDate) && today <= utcDay(week.endDate))
    ?? (weeks.length && today < utcDay(weeks[0].startDate) ? weeks[0] : null)
    ?? (weeks.length && today > utcDay(weeks[weeks.length - 1].endDate) ? weeks[weeks.length - 1] : null);
}

type Authorize = (groupId: string, role: GroupRole) => Promise<{ groupId: string }>;
export function createGroupCurrentWeekHandler(
  db: Pick<PrismaClient, "cycle" | "cycleMember">,
  authorize: Authorize,
  now: () => Date = () => new Date(),
) {
  return async (_request: Request, { params }: { params: Promise<{ groupId: string }> }) => {
    try {
      const context = await authorize((await params).groupId, "OPERATOR");
      const cycle = await db.cycle.findFirst({
        where: { groupId: context.groupId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, name: true, startDate: true, numberOfWeeks: true,
          contributionPerHandDay: true, daysPerWeek: true, totalHandsSnapshot: true,
          weeklyPayoutAmount: true, status: true,
          weeks: { orderBy: { weekNumber: "asc" }, select: {
            id: true, weekNumber: true, startDate: true, endDate: true, status: true,
          } },
        },
      });
      if (!cycle) return Response.json({ cycle: null, week: null, members: [] });
      const { weeks, ...snapshot } = cycle;
      const week = selectCurrentWeek(weeks, now());
      if (!week) return Response.json({ cycle: snapshot, week: null, members: [] });
      const members = await db.cycleMember.findMany({
        where: { cycleId: cycle.id, cycle: { groupId: context.groupId } },
        orderBy: { nameSnapshot: "asc" },
        select: {
          id: true, nameSnapshot: true, handsCount: true,
          payments: {
            where: { weekId: week.id, week: { cycleId: cycle.id, cycle: { groupId: context.groupId } } },
            orderBy: { dayIndex: "asc" },
            select: { id: true, dayIndex: true, expectedAmount: true, paidAmount: true, status: true },
          },
        },
      });
      return Response.json({ cycle: snapshot, week, members });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "AUTH_REQUIRED") return Response.json({ error: "Authentication required." }, { status: 401 });
      if (code === "FORBIDDEN") return Response.json({ error: "Group staff access required." }, { status: 403 });
      console.error("Group current-week read failed");
      return Response.json({ error: "Unable to read group current week." }, { status: 500 });
    }
  };
}
