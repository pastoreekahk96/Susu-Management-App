import { attachLegacyGroup } from "./group-backfill-step.mjs";

// Called only after synthetic fixtures have been created in a rollback-only transaction.
export async function rehearseBackfillStep(tx, prefix) {
  const target = { groupId: `${prefix}-group`, ownerId: `${prefix}-user` };
  const before = [];
  for (const table of ["Member", "Cycle"]) {
    const [row] = await tx.$queryRawUnsafe(`SELECT jsonb_agg(to_jsonb(t) ORDER BY id)::text AS records FROM "${table}" t`);
    before.push(row.records);
  }
  await tx.$executeRawUnsafe('UPDATE "Member" SET "groupId" = NULL WHERE "groupId" = $1', target.groupId);
  await tx.$executeRawUnsafe('UPDATE "Cycle" SET "groupId" = NULL WHERE "groupId" = $1', target.groupId);
  const first = await attachLegacyGroup(tx, target);
  if (first.members !== 15 || first.cycles !== 1) throw new Error("IMPLEMENTATION_ATTACHMENT_COUNT_FAILED");
  const repeat = await attachLegacyGroup(tx, target);
  if (repeat.members !== 0 || repeat.cycles !== 0) throw new Error("IMPLEMENTATION_REPEAT_FAILED");
  for (const [index, table] of ["Member", "Cycle"].entries()) {
    const [row] = await tx.$queryRawUnsafe(`SELECT jsonb_agg(to_jsonb(t) ORDER BY id)::text AS records FROM "${table}" t`);
    if (row.records !== before[index]) throw new Error("IMPLEMENTATION_ASSIGNMENT_CHANGED");
  }
}
