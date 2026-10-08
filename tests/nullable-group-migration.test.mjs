import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";

// Optional isolated PostgreSQL test dependency; never uses DATABASE_URL.
// Install @electric-sql/pglite in a disposable directory and set
// PGLITE_PACKAGE_JSON to that directory's package.json before running this test.
const require = createRequire(process.env.PGLITE_PACKAGE_JSON ?? import.meta.url);
const { PGlite } = require("@electric-sql/pglite");
const migrations = new URL("../prisma/migrations/", import.meta.url);
const target = "20261008203000_add_nullable_member_cycle_groups";

test("nullable group migration preserves records and enforces transitional constraints", async () => {
  const db = new PGlite();
  try {
    const directories = (await readdir(migrations, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const directory of directories.filter((name) => name < target)) {
      await db.exec(await readFile(new URL(`${directory}/migration.sql`, migrations), "utf8"));
    }
    await db.exec(`
      INSERT INTO "Member" (id, name, "updatedAt") VALUES ('test-member', 'Synthetic Participant', NOW());
      INSERT INTO "Cycle" (id, name, "startDate", "numberOfWeeks", "contributionPerHandDay", "daysPerWeek", "totalHandsSnapshot", "weeklyPayoutAmount", "updatedAt")
        VALUES ('test-cycle', 'Synthetic Cycle', '2026-01-05', 1, 50, 7, 1, 350, NOW());
      INSERT INTO "CycleMember" (id, "cycleId", "memberId", "nameSnapshot", "handsCount")
        VALUES ('test-cycle-member', 'test-cycle', 'test-member', 'Synthetic Participant', 1);
      INSERT INTO "CycleHand" (id, "cycleId", "cycleMemberId", "handNumber", status)
        VALUES ('test-hand', 'test-cycle', 'test-cycle-member', 1, 'SELECTED');
      INSERT INTO "Week" (id, "cycleId", "weekNumber", "startDate", "endDate", status)
        VALUES ('test-week', 'test-cycle', 1, '2026-01-05', '2026-01-11', 'PAID');
      INSERT INTO "DailyPayment" (id, "weekId", "cycleMemberId", "paymentDate", "dayIndex", "expectedAmount", "paidAmount", status, "updatedAt")
        VALUES ('test-payment', 'test-week', 'test-cycle-member', '2026-01-05', 0, 50, 20, 'PARTIAL', NOW());
      INSERT INTO "Payout" (id, "weekId", "handId", amount) VALUES ('test-payout', 'test-week', 'test-hand', 350);
      INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "afterJson")
        VALUES ('test-audit', 'SYNTHETIC_FIXTURE', 'DailyPayment', 'test-payment', '{"paidAmount":20}');
    `);
    const tables = ["Member", "Cycle", "CycleMember", "CycleHand", "Week", "DailyPayment", "Payout", "AuditLog", "User", "Session", "LoginAttempt", "Group", "GroupMembership"];
    async function snapshot() {
      const result = {};
      for (const table of tables) {
        const { rows } = await db.query(`SELECT to_jsonb(t) - 'groupId' AS record FROM "${table}" t ORDER BY id`);
        result[table] = rows;
      }
      return result;
    }
    const before = await snapshot();
    await db.exec(await readFile(new URL(`${target}/migration.sql`, migrations), "utf8"));
    assert.deepEqual(await snapshot(), before);
    for (const table of ["Member", "Cycle"]) {
      const { rows } = await db.query(`SELECT "groupId" FROM "${table}"`);
      assert.equal(rows[0].groupId, null);
      await assert.rejects(db.exec(`UPDATE "${table}" SET "groupId" = 'nonexistent'`), (error) => error.code === "23503");
    }
    const { rows: columns } = await db.query(`SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('Member', 'Cycle') AND column_name = 'groupId'`);
    assert.equal(columns.length, 2);
    assert.ok(columns.every((column) => column.is_nullable === "YES"));
    const { rows: indexes } = await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
      AND indexname IN ('Member_groupId_idx', 'Cycle_groupId_idx', 'Member_name_key', 'Cycle_one_active_key')`);
    assert.equal(indexes.length, 4);
    await assert.rejects(db.exec(`INSERT INTO "Member" (id, name, "updatedAt") VALUES ('duplicate', 'Synthetic Participant', NOW())`), (error) => error.code === "23505");
    await assert.rejects(db.exec(`INSERT INTO "Cycle" (id, name, "startDate", "numberOfWeeks", "contributionPerHandDay", "daysPerWeek", "totalHandsSnapshot", "weeklyPayoutAmount", "updatedAt")
      VALUES ('second-active', 'Synthetic Cycle 2', '2026-02-02', 1, 50, 7, 1, 350, NOW())`), (error) => error.code === "23505");
    await db.exec(`INSERT INTO "Group" (id, name, "updatedAt") VALUES ('test-group', 'Synthetic Group', NOW());
      UPDATE "Member" SET "groupId" = 'test-group'; UPDATE "Cycle" SET "groupId" = 'test-group';`);
    await assert.rejects(db.exec(`DELETE FROM "Group" WHERE id = 'test-group'`),
      (error) => ["23001", "23503"].includes(error.code));
    for (const table of ["Member", "Cycle"]) {
      const { rows } = await db.query(`SELECT "groupId" FROM "${table}"`);
      assert.equal(rows[0].groupId, "test-group");
    }
    await db.exec(`UPDATE "Member" SET "groupId" = NULL`);
    await assert.rejects(db.exec(`DELETE FROM "Group" WHERE id = 'test-group'`),
      (error) => ["23001", "23503"].includes(error.code));
  } finally {
    await db.close();
  }
});
