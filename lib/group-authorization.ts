import type { GroupRole } from "@prisma/client";

type Identity = { id: string };
type Membership = { userId: string; groupId: string; role: GroupRole };

export type GroupAuthorizationDependencies = {
  getCurrentUser: () => Promise<Identity | null>;
  findMembership: (userId: string, groupId: string) => Promise<Membership | null>;
};

const permissions: Record<GroupRole, readonly GroupRole[]> = {
  OWNER: ["OWNER"],
  ADMIN: ["OWNER", "ADMIN"],
  OPERATOR: ["OWNER", "ADMIN", "OPERATOR"],
  MEMBER: ["OWNER", "ADMIN", "OPERATOR", "MEMBER"],
};

// Resolve fresh membership on every call. Never infer group access from User.role.
export function createGroupAuthorizer(dependencies: GroupAuthorizationDependencies) {
  return async function requireGroupRole(groupId: string, requiredRole: GroupRole) {
    const user = await dependencies.getCurrentUser();
    if (!user) throw new Error("AUTH_REQUIRED");

    const allowed = permissions[requiredRole];
    if (!groupId || groupId.trim() !== groupId || !allowed) {
      throw new Error("FORBIDDEN");
    }

    const membership = await dependencies.findMembership(user.id, groupId);
    if (
      !membership || membership.userId !== user.id || membership.groupId !== groupId ||
      !allowed.includes(membership.role)
    ) {
      throw new Error("FORBIDDEN");
    }

    return { userId: user.id, groupId: membership.groupId, role: membership.role };
  };
}
