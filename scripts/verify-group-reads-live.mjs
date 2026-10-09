import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { Prisma, PrismaClient } from "@prisma/client";
import { verifyRehearsalTarget } from "./rehearsal-target.mjs";
import { checkGroupReadHttp } from "./check-group-read-http.mjs";
import { verifyGroupClient } from "./verify-group-client.mjs";

const tables = ["User", "Session", "Group", "GroupMembership", "Member", "Cycle", "CycleMember",
  "CycleHand", "Week", "DailyPayment", "Payout", "AuditLog"];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let stage = "preflight";

async function main() {
  if (process.argv.length !== 2) throw new Error("NO_ARGUMENTS_ALLOWED");
  verifyRehearsalTarget(execFileSync("git", ["branch", "--show-current"]).toString().trim(), process.env);
  verifyGroupClient(Prisma.dmmf?.datamodel?.models);
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_UNPOOLED });
  const prefix = `http-check-${randomUUID()}`;
  const ids = { user: `${prefix}-user`, session: `${prefix}-session`, membership: `${prefix}-membership`,
    groupA: `${prefix}-a`, groupB: `${prefix}-b`, missingGroup: `${prefix}-missing`,
    memberA: `${prefix}-ma`, memberB: `${prefix}-mb`, legacy: `${prefix}-legacy`,
    cycleA: `${prefix}-ca`, cycleB: `${prefix}-cb` };
  const token = randomBytes(32).toString("base64url");
  let created = false;
  let child;
  let loginBaseline;
  console.log("Synthetic fixture identifier:", prefix);
  try {
    stage = "fixture setup";
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map(t => `"${t}"`).join(", ")}, "LoginAttempt" IN SHARE ROW EXCLUSIVE MODE`);
      for (const table of tables) {
        const [row] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);
        if (row.count !== 0) throw new Error("STAGING_NOT_EMPTY");
      }
      loginBaseline = JSON.stringify(await tx.loginAttempt.findMany({ orderBy: { id: "asc" } }));
      await tx.user.create({ data: { id: ids.user, name: "Synthetic HTTP staff", email: `${prefix}@example.invalid`, role: "ADMIN" } });
      await tx.group.createMany({ data: [{ id: ids.groupA, name: "Synthetic A" }, { id: ids.groupB, name: "Synthetic B" }] });
      await tx.groupMembership.create({ data: { id: ids.membership, userId: ids.user, groupId: ids.groupA, role: "OPERATOR" } });
      await tx.member.createMany({ data: [
        { id: ids.memberA, name: `${prefix} A`, groupId: ids.groupA },
        { id: ids.memberB, name: `${prefix} B`, groupId: ids.groupB },
        { id: ids.legacy, name: `${prefix} legacy` },
      ] });
      const cycle = { startDate: new Date("2025-01-06"), numberOfWeeks: 47, contributionPerHandDay: 50,
        daysPerWeek: 7, totalHandsSnapshot: 47, weeklyPayoutAmount: 16450, status: "COMPLETED" };
      await tx.cycle.createMany({ data: [
        { ...cycle, id: ids.cycleA, name: "Synthetic cycle A", groupId: ids.groupA },
        { ...cycle, id: ids.cycleB, name: "Synthetic cycle B", groupId: ids.groupB },
      ] });
      await tx.session.create({ data: { id: ids.session, userId: ids.user,
        tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
    }, { isolationLevel: "Serializable", timeout: 30000 });
    created = true;
    stage = "local server startup";
    const reservation = createServer();
    await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
      stdio: "ignore", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
    let spawnError;
    child.on("error", error => { spawnError = error; });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (spawnError || child.exitCode !== null) throw new Error("LOCAL_SERVER_FAILED");
      try { ready = (await fetch(`${base}/api/auth/me`, { signal: AbortSignal.timeout(2000) })).status === 200; } catch { /* still starting */ }
      if (ready) break;
      await pause(1000);
      if (i % 15 === 14) console.log("Waiting for local app server...");
    }
    if (!ready) throw new Error("LOCAL_SERVER_TIMEOUT");
    console.log("Testing actual cookies, Prisma queries and group responses...");
    stage = "HTTP checks";
    await checkGroupReadHttp(base, token, ids, async state => {
      if (state === "MEMBER") await db.groupMembership.update({ where: { id: ids.membership }, data: { role: "MEMBER" } });
      if (state === "REVOKED") await db.groupMembership.delete({ where: { id: ids.membership } });
      if (state === "EXPIRED") await db.session.update({ where: { id: ids.session }, data: { expiresAt: new Date(0) } });
    });
    console.log("PASS: live local HTTP group-read checks passed against staging.");
  } finally {
    const previousStage = stage;
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([new Promise(resolve => child.once("exit", resolve)), pause(5000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    try {
      if (created) {
        stage = "synthetic fixture cleanup";
        await db.$transaction(async tx => {
          await tx.session.deleteMany({ where: { id: ids.session, userId: ids.user } });
          await tx.groupMembership.deleteMany({ where: { id: ids.membership, userId: ids.user } });
          await tx.cycle.deleteMany({ where: { id: { in: [ids.cycleA, ids.cycleB] }, status: "COMPLETED", weeks: { none: {} }, members: { none: {} }, hands: { none: {} } } });
          await tx.member.deleteMany({ where: { id: { in: [ids.memberA, ids.memberB, ids.legacy] }, cycleMembers: { none: {} } } });
          await tx.group.deleteMany({ where: { id: { in: [ids.groupA, ids.groupB] } } });
          await tx.user.deleteMany({ where: { id: ids.user, email: `${prefix}@example.invalid` } });
        });
        for (const table of tables) {
          const [row] = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);
          if (row.count !== 0) throw new Error("CLEANUP_VERIFICATION_FAILED");
        }
        if (JSON.stringify(await db.loginAttempt.findMany({ orderBy: { id: "asc" } })) !== loginBaseline) throw new Error("LOGIN_ATTEMPT_BASELINE_CHANGED");
        console.log("PASS: synthetic fixtures removed; application tables empty and login attempts unchanged.");
        stage = previousStage;
      }
    } finally { await db.$disconnect(); }
  }
}

main().catch(error => {
  const known = ["STALE_PRISMA_CLIENT_RUN_GENERATE", "NO_ARGUMENTS_ALLOWED", "WRONG_BRANCH", "WRONG_DATABASE_TARGET", "STAGING_NOT_EMPTY", "LOCAL_SERVER_FAILED", "LOCAL_SERVER_TIMEOUT", "CLEANUP_VERIFICATION_FAILED", "LOGIN_ATTEMPT_BASELINE_CHANGED"];
  const types = ["PrismaClientValidationError", "PrismaClientKnownRequestError", "PrismaClientInitializationError", "TypeError", "AssertionError", "SyntaxError"];
  const type = types.includes(error.name) ? error.name : "test/database error";
  const code = typeof error.code === "string" && /^(P\d{4}|ERR_ASSERTION|E[A-Z]+)$/.test(error.code) ? error.code : "UNKNOWN";
  console.error("Live verification stopped at", stage + ":", known.includes(error.message) ? error.message : `${type} (${code})`);
  if (error.message === "STALE_PRISMA_CLIENT_RUN_GENERATE") console.error("Run npx prisma generate, then retry this command. No database writes were attempted.");
  console.error("A complete pass requires BOTH PASS messages. Do not reset or seed the database.");
  process.exitCode = 1;
});
