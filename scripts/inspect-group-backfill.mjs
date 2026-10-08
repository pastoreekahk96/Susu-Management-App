import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { verifyRehearsalTarget } from "./rehearsal-target.mjs";

async function main() {
  if (process.argv.length !== 2) throw new Error("NO_ARGUMENTS_ALLOWED");
  verifyRehearsalTarget(execFileSync("git", ["branch", "--show-current"]).toString().trim(), process.env);
  const sql = await readFile(new URL("./group-backfill-report.sql", import.meta.url), "utf8");
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_UNPOOLED });
  try {
    const { report, candidates } = await db.$transaction(async (tx) => {
      // PostgreSQL enforces read-only access; repeatable read keeps both reports consistent.
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const [report] = await tx.$queryRawUnsafe(sql);
      const candidates = await tx.$queryRawUnsafe('SELECT id, name, role FROM "User" WHERE role = \'ADMIN\' ORDER BY id');
      return { report, candidates };
    }, { isolationLevel: "RepeatableRead", timeout: 30000, maxWait: 10000 });
    console.table([report]);
    console.table(candidates);
    if (report.inconsistent_group_links > 0) {
      console.log("BLOCKED: linked members and cycles have different group assignments. Review before planning a backfill.");
    } else if (report.unassigned_members === 0 && report.unassigned_cycles === 0) {
      console.log("NO BACKFILL NEEDED: no unassigned members or cycles.");
    } else {
      console.log("PLAN ONLY: unassigned records found. An explicit target group and owner must be reviewed before a write tool is enabled.");
    }
    console.log("READ ONLY: no records changed; no owner was selected automatically.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  const known = ["NO_ARGUMENTS_ALLOWED", "WRONG_BRANCH", "WRONG_DATABASE_TARGET"];
  console.error("Inspection stopped:", known.includes(error.message) ? error.message : `database error (${error.code ?? "UNKNOWN"})`);
  process.exitCode = 1;
});
