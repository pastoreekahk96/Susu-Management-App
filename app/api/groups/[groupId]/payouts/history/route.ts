import { prisma } from "../../../../../../lib/prisma";
import { requireGroupRole } from "../../../../../../lib/group-auth";
import { createGroupPayoutHistoryHandler } from "../../../../../../lib/group-payout-history";

export const GET = createGroupPayoutHistoryHandler(prisma, requireGroupRole);
