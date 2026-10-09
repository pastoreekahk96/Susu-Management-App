import { prisma } from "../../../../../lib/prisma";
import { requireGroupRole } from "../../../../../lib/group-auth";
import { createGroupReadHandlers } from "../../../../../lib/group-read-handlers";

export const GET = createGroupReadHandlers(prisma, requireGroupRole).cycles;
