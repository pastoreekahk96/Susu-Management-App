SELECT
  (SELECT COUNT(*)::int FROM "Member") AS members,
  (SELECT COUNT(*)::int FROM "Member" WHERE "groupId" IS NULL) AS unassigned_members,
  (SELECT COUNT(*)::int FROM "Cycle") AS cycles,
  (SELECT COUNT(*)::int FROM "Cycle" WHERE "groupId" IS NULL) AS unassigned_cycles,
  (SELECT COUNT(*)::int FROM "Group") AS groups,
  (SELECT COUNT(*)::int FROM "User" WHERE role = 'ADMIN') AS administrator_candidates,
  (SELECT COUNT(*)::int FROM "CycleMember" cm
    JOIN "Member" m ON m.id = cm."memberId"
    JOIN "Cycle" c ON c.id = cm."cycleId"
    WHERE m."groupId" IS DISTINCT FROM c."groupId") AS inconsistent_group_links,
  (SELECT COUNT(*)::int FROM "DailyPayment") AS daily_records,
  (SELECT COALESCE(SUM("expectedAmount"), 0)::text FROM "DailyPayment") AS expected_ld,
  (SELECT COALESCE(SUM("paidAmount"), 0)::text FROM "DailyPayment") AS recorded_ld,
  (SELECT COUNT(*)::int FROM "Payout") AS payouts,
  (SELECT COALESCE(SUM(amount), 0)::text FROM "Payout") AS payout_ld,
  (SELECT COUNT(*)::int FROM "AuditLog") AS audit_records;
