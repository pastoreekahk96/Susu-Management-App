import { prisma } from "../../../../../lib/prisma";
import { requireGroupRole } from "../../../../../lib/group-auth";
import { createGroupReadHandlers } from "../../../../../lib/group-read-handlers";
import { createGroupMemberWrites } from "../../../../../lib/group-member-writes";

export const GET = createGroupReadHandlers(prisma, requireGroupRole).members;
const writes = createGroupMemberWrites(prisma, requireGroupRole);
export const POST = writes.POST;
export const PATCH = writes.PATCH;
