import type { GroupRole, PrismaClient } from "@prisma/client";
import { validateSameOrigin } from "./security";

type Context = { params: Promise<{ groupId: string }> };
type Authorize = (groupId: string, role: GroupRole) => Promise<{ userId: string; groupId: string }>;
function nameValue(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name && name.length <= 120 ? name : null;
}

export function createGroupMemberWrites(db: PrismaClient, authorize: Authorize) {
  function handler(edit: boolean) {
    return async (request: Request, { params }: Context) => {
      if (!validateSameOrigin(request)) return Response.json({ error: "Cross-origin request blocked." }, { status: 403 });
      try {
        const { groupId } = await params;
        const actor = await authorize(groupId, "ADMIN");
        const body = await request.json().catch(() => null);
        const allowed = edit ? ["id", "name", "active"] : ["name"];
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) {
          return Response.json({ error: "Invalid member fields." }, { status: 400 });
        }
        const name = body.name === undefined && edit ? undefined : nameValue(body.name);
        if (name === null || (edit && (typeof body.id !== "string" || !body.id.trim())) ||
          (body.active !== undefined && typeof body.active !== "boolean") ||
          (edit && body.name === undefined && body.active === undefined)) {
          return Response.json({ error: "Valid member id, name or active status required." }, { status: 400 });
        }
        const member = await db.$transaction(async tx => {
          // Recheck membership in the same serializable transaction as the write.
          const membership = await tx.groupMembership.findFirst({ where: {
            userId: actor.userId, groupId: actor.groupId, role: { in: ["OWNER", "ADMIN"] },
          } });
          if (!membership) throw new Error("FORBIDDEN");
          const existing = edit ? await tx.member.findFirst({ where: { id: body.id, groupId: actor.groupId } }) : null;
          if (edit && !existing) throw new Error("MEMBER_NOT_FOUND");
          let result;
          if (existing) {
            const updated = await tx.member.updateMany({ where: { id: existing.id, groupId: actor.groupId },
              data: { name: name ?? existing.name, active: body.active ?? existing.active } });
            if (updated.count !== 1) throw new Error("MEMBER_NOT_FOUND");
            result = await tx.member.findFirstOrThrow({ where: { id: existing.id, groupId: actor.groupId } });
          } else {
            result = await tx.member.create({ data: { name: name!, active: true, groupId: actor.groupId } });
          }
          const snapshot = (row: typeof result) => JSON.stringify({ name: row.name, active: row.active, groupId: row.groupId });
          await tx.auditLog.create({ data: { actorId: actor.userId, action: edit ? "MEMBER_UPDATED" : "MEMBER_CREATED",
            entityType: "Member", entityId: result.id, beforeJson: existing ? snapshot(existing) : null,
            afterJson: snapshot(result) } });
          return { id: result.id, name: result.name, active: result.active };
        }, { isolationLevel: "Serializable" });
        return Response.json({ member }, { status: edit ? 200 : 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "AUTH_REQUIRED") return Response.json({ error: "Authentication required." }, { status: 401 });
        if (message === "FORBIDDEN") return Response.json({ error: "Group administrator access required." }, { status: 403 });
        if (message === "MEMBER_NOT_FOUND") return Response.json({ error: "Member not found." }, { status: 404 });
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
        if (code === "P2002") return Response.json({ error: "Member name unavailable." }, { status: 409 });
        if (code === "P2034") return Response.json({ error: "Concurrent change. Please retry." }, { status: 409 });
        console.error("Group member write failed");
        return Response.json({ error: "Unable to save group member." }, { status: 500 });
      }
    };
  }
  return { POST: handler(false), PATCH: handler(true) };
}
