import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(process.env.PGLITE_PACKAGE_JSON ?? import.meta.url);
const { PGlite } = require("@electric-sql/pglite");
const migrations = new URL("../prisma/migrations/", import.meta.url);
const sql = await readFile(new URL("../scripts/group-backfill-report.sql", import.meta.url), "utf8");

test("report distinguishes empty, unassigned and conflicting records without writes", async () => {
  const db = new PGlite();
  try {
    for (const directory of (await readdir(migrations, { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name).sort()) {
      await db.exec(await readFile(new URL(`${directory}/migration.sql`, migrations), "utf8"));
    }
    const empty = (await db.query(sql)).rows[0];
    assert.equal(empty.unassigned_members, 0);
    assert.equal(empty.administrator_candidates, 0);
    assert.equal(empty.recorded_ld, "0");
    await db.exec(`INSERT INTO "Member" (id, name, "updatedAt") VALUES ('m', 'Synthetic participant', NOW());
      INSERT INTO "Cycle" (id, name, "startDate", "numberOfWeeks", "contributionPerHandDay", "daysPerWeek", "totalHandsSnapshot", "weeklyPayoutAmount", "updatedAt")
      VALUES ('c', 'Synthetic cycle', NOW(), 47, 50, 7, 47, 16450, NOW());
      INSERT INTO "CycleMember" (id, "cycleId", "memberId", "nameSnapshot", "handsCount") VALUES ('cm', 'c', 'm', 'Synthetic participant', 1);`);
    let report = (await db.query(sql)).rows[0];
    assert.equal(report.unassigned_members, 1);
    assert.equal(report.unassigned_cycles, 1);
    assert.equal(report.inconsistent_group_links, 0);
    await db.exec(`INSERT INTO "Group" (id, name, "updatedAt") VALUES ('g', 'Synthetic group', NOW());
      UPDATE "Member" SET "groupId" = 'g';`);
    await db.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    report = (await db.query(sql)).rows[0];
    assert.equal(report.inconsistent_group_links, 1);
    assert.equal(report.unassigned_members, 0);
    assert.equal(report.unassigned_cycles, 1);
    await assert.rejects(db.exec('UPDATE "Member" SET "groupId" = NULL'), /read-only/);
    await db.exec("ROLLBACK");
    assert.equal((await db.query('SELECT "groupId" FROM "Member"')).rows[0].groupId, 'g');
  } finally { await db.close(); }
});
