import type { GroupRole } from "@prisma/client";

type Dependencies<T> = {
  authorize: (groupId: string, role: GroupRole) => Promise<{ groupId: string }>;
  find: (groupId: string) => Promise<T>;
};

// Entire group directories are staff-only until own-member access is implemented.
export function createGroupReader<T>({ authorize, find }: Dependencies<T>) {
  return async (groupId: string) => {
    const context = await authorize(groupId, "OPERATOR");
    return find(context.groupId);
  };
}
