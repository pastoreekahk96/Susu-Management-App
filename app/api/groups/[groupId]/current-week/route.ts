import { prisma } from "../../../../../lib/prisma";
import { requireGroupRole } from "../../../../../lib/group-auth";
import { createGroupCurrentWeekHandler } from "../../../../../lib/group-current-week";

export const GET = createGroupCurrentWeekHandler(prisma, requireGroupRole);
