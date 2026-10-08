-- One statement, always executed inside an outer rollback-only transaction.
-- All identities and amounts below are synthetic fixtures, not collected money.
DO $rehearsal$
DECLARE
  prefix TEXT := '__PREFIX__';
  allocations INT[] := ARRAY[4,1,1,1,2,10,2,3,2,2,4,2,4,5,4];
  table_name TEXT;
  before_rows JSONB;
  after_rows JSONB;
  i INT;
BEGIN
  CREATE TEMP TABLE rehearsal_snapshots (entity TEXT PRIMARY KEY, records JSONB) ON COMMIT DROP;
  CREATE TEMP TABLE rehearsal_report (check_name TEXT PRIMARY KEY, result TEXT) ON COMMIT DROP;

  INSERT INTO "User" (id, name, email, role, "updatedAt")
    VALUES (prefix || '-user', 'Synthetic Owner', prefix || '@example.invalid', 'ADMIN', NOW());
  FOR i IN 1..15 LOOP
    INSERT INTO "Member" (id, name, "updatedAt")
      VALUES (prefix || '-member-' || i, prefix || ' Participant ' || i, NOW());
  END LOOP;
  INSERT INTO "Cycle" (id, name, "startDate", "numberOfWeeks", "contributionPerHandDay",
    "daysPerWeek", "totalHandsSnapshot", "weeklyPayoutAmount", "updatedAt")
    VALUES (prefix || '-cycle', 'Synthetic 47-hand rehearsal', '2025-01-06', 47, 50, 7, 47, 16450, NOW());
  FOR i IN 1..15 LOOP
    INSERT INTO "CycleMember" (id, "cycleId", "memberId", "nameSnapshot", "handsCount")
      VALUES (prefix || '-cm-' || i, prefix || '-cycle', prefix || '-member-' || i,
        prefix || ' Participant ' || i, allocations[i]);
  END LOOP;
  INSERT INTO "CycleHand" (id, "cycleId", "cycleMemberId", "handNumber")
    SELECT prefix || '-hand-' || n, prefix || '-cycle', cm_id, n::int
    FROM (SELECT cm.id AS cm_id, ROW_NUMBER() OVER (ORDER BY cm.id, hand) AS n
      FROM "CycleMember" cm CROSS JOIN LATERAL generate_series(1, cm."handsCount") hand) expanded;
  INSERT INTO "Week" (id, "cycleId", "weekNumber", "startDate", "endDate", status)
    SELECT prefix || '-week-' || n, prefix || '-cycle', n,
      TIMESTAMP '2025-01-06' + (n-1)*INTERVAL '7 days',
      TIMESTAMP '2025-01-12' + (n-1)*INTERVAL '7 days',
      CASE WHEN n = 1 THEN 'PAID'::"WeekStatus" ELSE 'OPEN'::"WeekStatus" END
    FROM generate_series(1,47) n;
  INSERT INTO "DailyPayment" (id, "weekId", "cycleMemberId", "paymentDate", "dayIndex",
    "expectedAmount", "paidAmount", status, "paidAt", "recordedById", "updatedAt")
    SELECT prefix || '-payment-' || w."weekNumber" || '-' || cm.id || '-' || d,
      w.id, cm.id, w."startDate" + d*INTERVAL '1 day', d, cm."handsCount"*50,
      CASE WHEN w."weekNumber" = 1 THEN cm."handsCount"*50
           WHEN w."weekNumber" = 2 AND cm.id = prefix || '-cm-1' AND d = 0 THEN 20 ELSE 0 END,
      CASE WHEN w."weekNumber" = 1 THEN 'PAID'::"PaymentStatus"
           WHEN w."weekNumber" = 2 AND cm.id = prefix || '-cm-1' AND d = 0 THEN 'PARTIAL'::"PaymentStatus"
           ELSE 'UNPAID'::"PaymentStatus" END,
      CASE WHEN w."weekNumber" = 1 OR (w."weekNumber" = 2 AND cm.id = prefix || '-cm-1' AND d = 0)
           THEN w."startDate" + d*INTERVAL '1 day' ELSE NULL END,
      prefix || '-user', NOW()
    FROM "Week" w CROSS JOIN "CycleMember" cm CROSS JOIN generate_series(0,6) d;
  UPDATE "CycleHand" SET status = 'SELECTED' WHERE id = prefix || '-hand-1';
  INSERT INTO "Payout" (id, "weekId", "handId", amount, "selectionMethod", "manualReason", "recordedById")
    VALUES (prefix || '-payout', prefix || '-week-1', prefix || '-hand-1', 16450,
      'MANUAL', 'Synthetic historical fixture for preservation testing', prefix || '-user');
  INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", "afterJson")
    VALUES (prefix || '-audit', prefix || '-user', 'SYNTHETIC_FIXTURE', 'Payout', prefix || '-payout', '{"amount":16450}');

  FOREACH table_name IN ARRAY ARRAY['User','Member','Cycle','CycleMember','CycleHand','Week','DailyPayment','Payout','AuditLog','LoginAttempt'] LOOP
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t) - ''groupId'' ORDER BY id), ''[]''::jsonb) FROM %I t', table_name) INTO before_rows;
    INSERT INTO rehearsal_snapshots VALUES (table_name, before_rows);
  END LOOP;

  INSERT INTO "Group" (id, name, "updatedAt") VALUES (prefix || '-group', 'Synthetic Rehearsal Group', NOW());
  INSERT INTO "GroupMembership" (id, "userId", "groupId", role, "updatedAt")
    VALUES (prefix || '-membership', prefix || '-user', prefix || '-group', 'OWNER', NOW());
  UPDATE "Member" SET "groupId" = prefix || '-group' WHERE "groupId" IS NULL;
  UPDATE "Cycle" SET "groupId" = prefix || '-group' WHERE "groupId" IS NULL;

  FOREACH table_name IN ARRAY ARRAY['User','Member','Cycle','CycleMember','CycleHand','Week','DailyPayment','Payout','AuditLog','LoginAttempt'] LOOP
    SELECT records INTO before_rows FROM rehearsal_snapshots WHERE entity = table_name;
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t) - ''groupId'' ORDER BY id), ''[]''::jsonb) FROM %I t', table_name) INTO after_rows;
    IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Preservation failed for %', table_name; END IF;
  END LOOP;
  IF (SELECT COUNT(*) FROM "Member" WHERE "groupId" = prefix || '-group') <> 15 OR
     (SELECT COUNT(*) FROM "Cycle" WHERE "groupId" = prefix || '-group') <> 1 OR
     (SELECT COUNT(*) FROM "CycleHand") <> 47 OR (SELECT COUNT(*) FROM "Week") <> 47 OR
     (SELECT COUNT(*) FROM "DailyPayment") <> 4935 THEN RAISE EXCEPTION 'Structure mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM "CycleMember" cm JOIN "Member" m ON m.id = cm."memberId"
    JOIN "Cycle" c ON c.id = cm."cycleId" WHERE m."groupId" IS DISTINCT FROM c."groupId")
    THEN RAISE EXCEPTION 'Cross-group member-cycle mismatch'; END IF;
  IF (SELECT SUM("expectedAmount") FROM "DailyPayment") <> 773150 OR
     (SELECT SUM("paidAmount") FROM "DailyPayment") <> 16470 OR
     (SELECT SUM(amount) FROM "Payout") <> 16450 OR
     (SELECT COUNT(*) FROM "CycleHand" WHERE status = 'SELECTED') <> 1 OR
     (SELECT COUNT(*) FROM "DailyPayment" WHERE status = 'PARTIAL') <> 1
    THEN RAISE EXCEPTION 'Financial totals mismatch'; END IF;
  IF (SELECT role FROM "GroupMembership" WHERE "userId" = prefix || '-user') <> 'OWNER'
    THEN RAISE EXCEPTION 'Membership mismatch'; END IF;

  -- Repeating the same null-only attachment must make no additional changes.
  UPDATE "Member" SET "groupId" = prefix || '-group' WHERE "groupId" IS NULL;
  IF FOUND THEN RAISE EXCEPTION 'Member attachment not idempotent'; END IF;
  UPDATE "Cycle" SET "groupId" = prefix || '-group' WHERE "groupId" IS NULL;
  IF FOUND THEN RAISE EXCEPTION 'Cycle attachment not idempotent'; END IF;
  INSERT INTO rehearsal_report VALUES
    ('structure', '15 members / 47 hands / 47 weeks / 4935 daily records'),
    ('expected cycle contributions', '773150 LD'),
    ('synthetic recorded collections', '16470 LD (includes one partial payment)'),
    ('synthetic historical payout', '16450 LD / one selected hand'),
    ('preservation', 'All existing fixture IDs, values, dates, statuses and audit rows unchanged'),
    ('relationships', 'Member/cycle group links agree; synthetic owner membership exists'),
    ('repeat attachment', 'No additional rows changed');
END
$rehearsal$;
