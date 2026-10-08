// Internal transaction step only. No CLI, API route, or production runner calls it.
// Caller must own the transaction and roll back on any error.
const preserved = ["User", "Session", "LoginAttempt", "Group", "GroupMembership", "Member", "Cycle",
  "CycleMember", "CycleHand", "Week", "DailyPayment", "Payout", "AuditLog"];

async function snapshot(tx) {
  const records = [];
  for (const table of preserved) {
    const exclude = ["Member", "Cycle"].includes(table) ? " - 'groupId'" : "";
    const [row] = await tx.$queryRawUnsafe(`SELECT COALESCE(jsonb_agg(to_jsonb(t)${exclude} ORDER BY id), '[]'::jsonb)::text AS records FROM "${table}" t`);
    records.push(row.records);
  }
  return records;
}

export async function attachLegacyGroup(tx, { groupId, ownerId }) {
  if (typeof groupId !== "string" || !groupId.trim() || typeof ownerId !== "string" || !ownerId.trim()) {
    throw new Error("EXPLICIT_GROUP_AND_OWNER_REQUIRED");
  }
  // Blocks concurrent changes while checking ownership, assignments and preservation.
  await tx.$executeRawUnsafe(`LOCK TABLE ${preserved.map(t => `"${t}"`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`);
  const owners = await tx.$queryRawUnsafe(`SELECT gm.id FROM "GroupMembership" gm
    JOIN "Group" g ON g.id = gm."groupId" JOIN "User" u ON u.id = gm."userId"
    WHERE gm."groupId" = $1 AND gm."userId" = $2 AND gm.role = 'OWNER'`, groupId, ownerId);
  if (owners.length !== 1) throw new Error("EXISTING_OWNER_MEMBERSHIP_REQUIRED");
  const [conflicts] = await tx.$queryRawUnsafe(`SELECT (
    (SELECT COUNT(*) FROM "Member" WHERE "groupId" IS NOT NULL AND "groupId" <> $1) +
    (SELECT COUNT(*) FROM "Cycle" WHERE "groupId" IS NOT NULL AND "groupId" <> $1)
    )::int AS count`, groupId);
  if (conflicts.count !== 0) throw new Error("OTHER_GROUP_RECORDS_PRESENT");
  const before = await snapshot(tx);
  // Raw SQL intentionally preserves updatedAt as well as every financial value.
  const members = await tx.$executeRawUnsafe('UPDATE "Member" SET "groupId" = $1 WHERE "groupId" IS NULL', groupId);
  const cycles = await tx.$executeRawUnsafe('UPDATE "Cycle" SET "groupId" = $1 WHERE "groupId" IS NULL', groupId);
  const [mismatch] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "CycleMember" cm
    JOIN "Member" m ON m.id = cm."memberId" JOIN "Cycle" c ON c.id = cm."cycleId"
    WHERE m."groupId" IS DISTINCT FROM c."groupId"`);
  if (mismatch.count !== 0) throw new Error("GROUP_RELATIONSHIP_MISMATCH");
  const after = await snapshot(tx);
  if (before.some((value, index) => value !== after[index])) throw new Error("BACKFILL_PRESERVATION_FAILED");
  return { members, cycles };
}
