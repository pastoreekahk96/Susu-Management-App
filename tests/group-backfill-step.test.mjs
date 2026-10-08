import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { attachLegacyGroup } from "../scripts/group-backfill-step.mjs";
const require = createRequire(process.env.PGLITE_PACKAGE_JSON ?? import.meta.url);
const { PGlite } = require("@electric-sql/pglite");

test("actual backfill step preserves synthetic financial history, requires ownership and repeats safely", async () => {
  const db = new PGlite();
  const tx = {
    $queryRawUnsafe: async (sql, ...args) => (await db.query(sql, args)).rows,
    $executeRawUnsafe: async (sql, ...args) => (await db.query(sql, args)).affectedRows,
  };
  try {
    const migrations = new URL("../prisma/migrations/", import.meta.url);
    for (const dir of (await readdir(migrations, { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name).sort()) {
      await db.exec(await readFile(new URL(`${dir}/migration.sql`, migrations), "utf8"));
    }
    await db.exec("BEGIN");
    await db.exec((await readFile(new URL("./fixtures/group-backfill-rehearsal.sql", import.meta.url), "utf8")).replaceAll("__PREFIX__", "step"));
    await db.exec('UPDATE "Member" SET "groupId" = NULL; UPDATE "Cycle" SET "groupId" = NULL');
    await assert.rejects(attachLegacyGroup(tx, { groupId: "", ownerId: "step-user" }), /EXPLICIT/);
    await assert.rejects(attachLegacyGroup(tx, { groupId: "step-group", ownerId: "absent" }), /OWNER_MEMBERSHIP/);
    const before = (await db.query('SELECT * FROM "DailyPayment" ORDER BY id')).rows;
    assert.deepEqual(await attachLegacyGroup(tx, { groupId: "step-group", ownerId: "step-user" }), { members: 15, cycles: 1 });
    assert.deepEqual(await attachLegacyGroup(tx, { groupId: "step-group", ownerId: "step-user" }), { members: 0, cycles: 0 });
    assert.deepEqual((await db.query('SELECT * FROM "DailyPayment" ORDER BY id')).rows, before);
    await db.exec(`INSERT INTO "Group" (id, name, "updatedAt") VALUES ('other', 'Other synthetic group', NOW());
      UPDATE "Member" SET "groupId" = 'other' WHERE id = 'step-member-1'`);
    await assert.rejects(attachLegacyGroup(tx, { groupId: "step-group", ownerId: "step-user" }), /OTHER_GROUP/);
    await db.exec('UPDATE "Member" SET "groupId" = NULL');
    const tamperedTx = { ...tx, $executeRawUnsafe: async (sql, ...args) => {
      const result = await tx.$executeRawUnsafe(sql, ...args);
      if (sql.startsWith('UPDATE "Cycle"')) await db.exec('UPDATE "DailyPayment" SET "paidAmount" = 0');
      return result;
    } };
    await assert.rejects(attachLegacyGroup(tamperedTx, { groupId: "step-group", ownerId: "step-user" }), /PRESERVATION/);
    await db.exec("ROLLBACK");
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM "Member"')).rows[0].count, 0);
  } finally { await db.close(); }
});
