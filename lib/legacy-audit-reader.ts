import type { PrismaClient } from "@prisma/client";

type Authorize = (role: "ADMIN") => Promise<unknown>;

// AuditLog has no durable group ownership. Do not infer historical access from
// the actor's current memberships, entity links, or optional JSON metadata.
export function createLegacyAuditReader(db: Pick<PrismaClient, "$transaction">, authorize: Authorize) {
  return async () => {
    await authorize("ADMIN");

    return db.$transaction(async tx => {
      const group = await tx.group.findFirst({ select: { id: true } });
      if (group) throw new Error("LEGACY_AUDIT_UNAVAILABLE");

      return tx.auditLog.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          beforeJson: true,
          afterJson: true,
          createdAt: true,
          actor: { select: { name: true, email: true, role: true } },
        },
      });
    }, {
      // Keep the no-group check and audit read in the same database snapshot.
      isolationLevel: "RepeatableRead",
    });
  };
}
