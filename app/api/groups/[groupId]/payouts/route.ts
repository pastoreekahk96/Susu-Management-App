import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../../../../../lib/prisma";
import { requireGroupRole } from "../../../../../lib/group-auth";
import { createGroupPayoutSelector } from "../../../../../lib/group-payout-selection";

export const POST = createGroupPayoutSelector(prisma, requireGroupRole, async () => {
  const token = (await cookies()).get("susu_session")?.value;
  return token ? createHash("sha256").update(token).digest("hex") : null;
});
