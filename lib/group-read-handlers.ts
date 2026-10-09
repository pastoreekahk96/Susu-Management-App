import type { PrismaClient, GroupRole } from "@prisma/client";
import { createGroupReader } from "./group-readers";
type Context = { params: Promise<{ groupId: string }> };
type Authorize = (groupId: string, role: GroupRole) => Promise<{ groupId: string }>;
export function createGroupReadHandlers(db: Pick<PrismaClient, "member" | "cycle">, authorize: Authorize) {
  const readers = {
    members: createGroupReader({ authorize, find: (groupId) => db.member.findMany({
      where: { groupId }, orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true, createdAt: true },
    }) }),
    cycles: createGroupReader({ authorize, find: (groupId) => db.cycle.findMany({
      where: { groupId }, orderBy: { createdAt: "desc" },
      select: { id: true, name: true, startDate: true, numberOfWeeks: true,
        contributionPerHandDay: true, daysPerWeek: true, totalHandsSnapshot: true,
        weeklyPayoutAmount: true, status: true },
    }) }),
  };
  function handler(resource: keyof typeof readers) {
    return async (_request: Request, { params }: Context) => {
      try {
        const { groupId } = await params;
        return Response.json({ [resource]: await readers[resource](groupId) });
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "AUTH_REQUIRED") return Response.json({ error: "Authentication required." }, { status: 401 });
        if (code === "FORBIDDEN") return Response.json({ error: "Group staff access required." }, { status: 403 });
        console.error("Group read failed", resource);
        return Response.json({ error: "Unable to read group records." }, { status: 500 });
      }
    };
  }
  return { members: handler("members"), cycles: handler("cycles") };
}
