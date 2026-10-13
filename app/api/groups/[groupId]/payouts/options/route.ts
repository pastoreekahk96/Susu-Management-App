import { prisma } from "../../../../../../lib/prisma";
import { requireGroupRole } from "../../../../../../lib/group-auth";
import { createGroupPayoutOptionsHandler } from "../../../../../../lib/group-payout-options";

export const GET = createGroupPayoutOptionsHandler(prisma, requireGroupRole);
