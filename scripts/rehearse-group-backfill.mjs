import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { verifyRehearsalTarget } from "./rehearsal-target.mjs";

const tables = ["User", "Member", "Cycle", "CycleMember", "CycleHand", "Week",
  "DailyPayment", "Payout", "AuditLog", "Session", "LoginAttempt", "Group", "GroupMembership"];
const rollback = new Error("EXPECTED_REHEARSAL_ROLLBACK");

async function main() {
  verifyRehearsalTarget(execFileSync("git", ["branch", "--show-current"]).toString().trim(), process.env);
  const prefix = `rehearsal-${randomUUID()}`;
  const sql = (await readFile(new URL("../tests/fixtures/group-backfill-rehearsal.sql", import.meta.url), "utf8"))
    .replaceAll("__PREFIX__", prefix);
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_UNPOOLED });
  let report;
  let loginAttemptsBefore;
  try {
    try {
      await db.$transaction(async (tx) => {
        // Prevent other writers from changing the empty fixture target mid-rehearsal.
        await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map((name) => `"${name}"`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`);
        for (const table of tables) {
          if (table === "LoginAttempt") continue;
          const [{ count }] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);
          if (count !== 0) throw new Error("STAGING_NOT_EMPTY");
        }
        loginAttemptsBefore = JSON.stringify(await tx.$queryRawUnsafe('SELECT * FROM "LoginAttempt" ORDER BY id'));
        await tx.$executeRawUnsafe(sql);
        report = await tx.$queryRawUnsafe('SELECT * FROM rehearsal_report ORDER BY check_name');
        throw rollback;
      }, { isolationLevel: "Serializable", timeout: 120000, maxWait: 10000 });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    for (const table of tables) {
      if (table === "LoginAttempt") continue;
      const [{ count }] = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);
      if (count !== 0) throw new Error("POST_ROLLBACK_DATABASE_NOT_EMPTY");
    }
    if (JSON.stringify(await db.$queryRawUnsafe('SELECT * FROM "LoginAttempt" ORDER BY id')) !== loginAttemptsBefore) {
      throw new Error("LOGIN_ATTEMPT_BASELINE_CHANGED");
    }
    console.table(report);
    console.log("PASS: synthetic group backfill preserved records and totals.");
    console.log("PASS: transaction rolled back; fixture tables remain empty and login-attempt records are unchanged.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  const known = ["WRONG_BRANCH", "WRONG_DATABASE_TARGET", "STAGING_NOT_EMPTY", "POST_ROLLBACK_DATABASE_NOT_EMPTY", "LOGIN_ATTEMPT_BASELINE_CHANGED"];
  console.error("Rehearsal stopped:", known.includes(error.message) ? error.message : `database/test error (${error.code ?? "UNKNOWN"})`);
  console.error("No successful rehearsal has been confirmed. Do not reset or seed the database.");
  process.exitCode = 1;
});
