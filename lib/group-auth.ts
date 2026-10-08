import { getCurrentUser } from "./auth";
import { prisma } from "./prisma";
import { createGroupAuthorizer } from "./group-authorization";

// Server-only entry point: identity comes from the session, never from the client.
// Callers must also scope resource queries to the returned groupId.
export const requireGroupRole = createGroupAuthorizer({
  getCurrentUser,
  findMembership: (userId, groupId) => prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId, groupId } },
    select: { userId: true, groupId: true, role: true },
  }),
});
