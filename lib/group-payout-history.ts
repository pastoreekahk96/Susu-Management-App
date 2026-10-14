import type { GroupRole, PrismaClient } from "@prisma/client";

type Authorize = (groupId: string, role: GroupRole) => Promise<{ groupId: string }>;
type Database = Pick<PrismaClient, "payout">;
const headers = { "Cache-Control": "private, no-store" };

export function createGroupPayoutHistoryHandler(db: Database, authorize: Authorize) {
  return async (request: Request, { params }: { params: Promise<{ groupId: string }> }) => {
    try {
      const actor = await authorize((await params).groupId, "OPERATOR");
      const query = new URL(request.url).searchParams;
      const cursor = query.get("cursor");
      if ([...query.keys()].some(key => key !== "cursor") || query.getAll("cursor").length > 1 ||
        (cursor !== null && (!cursor.trim() || cursor.length > 200))) {
        return Response.json({ error: "Invalid history query." }, { status: 400, headers });
      }
      const scope = {
        week: { cycle: { groupId: actor.groupId } },
        hand: { cycle: { groupId: actor.groupId }, cycleMember: { cycle: { groupId: actor.groupId } } },
      };
      if (cursor && !await db.payout.findFirst({ where: { ...scope, id: cursor }, select: { id: true } })) {
        return Response.json({ error: "History cursor unavailable." }, { status: 404, headers });
      }
      const rows = await db.payout.findMany({
        where: scope, orderBy: [{ drawnAt: "desc" }, { id: "desc" }], take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true, amount: true, selectionMethod: true, manualReason: true, status: true,
          drawnAt: true, collectedAt: true,
          week: { select: { id: true, cycleId: true, weekNumber: true, startDate: true, endDate: true,
            cycle: { select: { id: true, name: true, status: true } } } },
          hand: { select: { id: true, cycleId: true, handNumber: true,
            cycleMember: { select: { id: true, cycleId: true, nameSnapshot: true } } } },
          recordedBy: { select: { id: true, name: true } },
        },
      });
      if (rows.some(row => row.week.cycleId !== row.hand.cycleId || row.hand.cycleId !== row.hand.cycleMember.cycleId)) {
        throw new Error("INCONSISTENT_PAYOUT_HISTORY");
      }
      return Response.json({ payouts: rows.slice(0, 100), nextCursor: rows.length > 100 ? rows[99].id : null }, { headers });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "AUTH_REQUIRED") return Response.json({ error: "Authentication required." }, { status: 401, headers });
      if (code === "FORBIDDEN") return Response.json({ error: "Group staff access required." }, { status: 403, headers });
      console.error("Group payout history read failed");
      return Response.json({ error: "Unable to load group payout history." }, { status: 500, headers });
    }
  };
}
