import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { verifyRehearsalTarget } from "../scripts/rehearsal-target.mjs";

const require = createRequire(process.env.PGLITE_PACKAGE_JSON ?? import.meta.url);
const { PGlite } = require("@electric-sql/pglite");
const migrations = new URL("../prisma/migrations/", import.meta.url);
const source = await readFile(new URL("./fixtures/group-backfill-rehearsal.sql", import.meta.url), "utf8");

test("rehearsal refuses wrong branches, missing URLs and non-staging destinations", () => {
  const environment = {
    DATABASE_URL: "postgresql://synthetic:synthetic@ep-shiny-snow-b75mtlqx-pooler.c-13.us-east-1.aws.neon.tech/neondb",
    DATABASE_URL_UNPOOLED: "postgresql://synthetic:synthetic@ep-shiny-snow-b75mtlqx.c-13.us-east-1.aws.neon.tech/neondb",
  };
  assert.doesNotThrow(() => verifyRehearsalTarget("advanced-susu-management-upgrade", environment));
  assert.throws(() => verifyRehearsalTarget("main", environment), /WRONG_BRANCH/);
  for (const key of Object.keys(environment)) {
    for (const value of [undefined, "", "postgresql://localhost/neondb", environment[key].replace("/neondb", "/other"), `${environment[key]}?schema=other`]) {
      assert.throws(() => verifyRehearsalTarget("advanced-susu-management-upgrade", { ...environment, [key]: value }), /WRONG_DATABASE_TARGET/);
    }
  }
});

test("full synthetic backfill preserves records, detects tampering and rolls back", async () => {
  const db = new PGlite();
  try {
    const directories = (await readdir(migrations, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const directory of directories) {
      await db.exec(await readFile(new URL(`${directory}/migration.sql`, migrations), "utf8"));
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await db.exec("BEGIN");
      await db.exec(source.replaceAll("__PREFIX__", `synthetic-${attempt}`));
      const { rows } = await db.query("SELECT * FROM rehearsal_report");
      assert.equal(rows.length, 7);
      assert.equal(rows.find((row) => row.check_name === "expected cycle contributions").result, "773150 LD");
      await db.exec("ROLLBACK");
      const { rows: counts } = await db.query(`SELECT
        (SELECT COUNT(*)::int FROM "Member") AS members,
        (SELECT COUNT(*)::int FROM "Cycle") AS cycles,
        (SELECT COUNT(*)::int FROM "DailyPayment") AS payments,
        (SELECT COUNT(*)::int FROM "Payout") AS payouts,
        (SELECT COUNT(*)::int FROM "Group") AS groups,
        (SELECT COUNT(*)::int FROM "User") AS users`);
      assert.deepEqual(counts[0], { members: 0, cycles: 0, payments: 0, payouts: 0, groups: 0, users: 0 });
    }
    await db.exec("BEGIN");
    const tampered = source.replace('  INSERT INTO "Group"', '  UPDATE "DailyPayment" SET "paidAmount" = 0;\n  INSERT INTO "Group"');
    await assert.rejects(db.exec(tampered.replaceAll("__PREFIX__", "synthetic-tamper")), /Preservation failed for DailyPayment/);
    await db.exec("ROLLBACK");
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM "DailyPayment"')).rows[0].count, 0);
  } finally {
    await db.close();
  }
});
