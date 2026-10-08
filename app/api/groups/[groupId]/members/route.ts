import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireGroupRole } from "../../../../../lib/group-auth";
import { createGroupReader } from "../../../../../lib/group-readers";

const read = createGroupReader({
  authorize: requireGroupRole,
  find: (groupId) => prisma.member.findMany({
    where: { groupId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, active: true, createdAt: true },
  }),
});

export async function GET(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    return NextResponse.json({ members: await read(groupId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "AUTH_REQUIRED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Group staff access required." }, { status: 403 });
    console.error("Group member read failed");
    return NextResponse.json({ error: "Unable to read group members." }, { status: 500 });
  }
}
