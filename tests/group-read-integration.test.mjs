import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createSessionReader } from "../lib/session-reader.ts";
import { createGroupAuthorizer } from "../lib/group-authorization.ts";
import { createGroupReadHandlers } from "../lib/group-read-handlers.ts";
const require = createRequire(process.env.PGLITE_PACKAGE_JSON ?? import.meta.url);
const { PGlite } = require("@electric-sql/pglite");
const hash = token => createHash("sha256").update(token).digest("hex");

test("HTTP handlers isolate groups using database sessions, memberships and resource projections", async () => {
  const db = new PGlite();
  let token;
  let queries = 0;
  let failure = false;
  try {
    const migrations = new URL("../prisma/migrations/", import.meta.url);
    for (const dir of (await readdir(migrations, { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name).sort()) {
      await db.exec(await readFile(new URL(`${dir}/migration.sql`, migrations), "utf8"));
    }
    await db.exec(`INSERT INTO "User" (id,name,email,role,"updatedAt") VALUES ('u','Synthetic staff','u@example.invalid','ADMIN',NOW());
      INSERT INTO "Group" (id,name,"updatedAt") VALUES ('a','A',NOW()), ('b','B',NOW());
      INSERT INTO "GroupMembership" (id,"userId","groupId",role,"updatedAt") VALUES ('ma','u','a','OPERATOR',NOW());
      INSERT INTO "Member" (id,name,"groupId","updatedAt") VALUES ('member-a','Synthetic A','a',NOW()), ('member-b','Synthetic B','b',NOW()), ('legacy','Synthetic legacy',NULL,NOW());
      INSERT INTO "Cycle" (id,name,"groupId","startDate","numberOfWeeks","contributionPerHandDay","daysPerWeek","totalHandsSnapshot","weeklyPayoutAmount",status,"updatedAt")
      VALUES ('cycle-a','Cycle A','a',NOW(),47,50,7,47,16450,'COMPLETED',NOW()), ('cycle-b','Cycle B','b',NOW(),47,50,7,47,16450,'COMPLETED',NOW());`);
    await db.query(`INSERT INTO "Session" (id,"tokenHash","userId","expiresAt") VALUES ('s',$1,'u','2099-01-01')`, [hash('synthetic-token')]);
    const authorize = createGroupAuthorizer({
      getCurrentUser: createSessionReader({
        getToken: async () => token,
        findSession: async value => {
          const { rows } = await db.query('SELECT s."expiresAt", u.id FROM "Session" s JOIN "User" u ON u.id = s."userId" WHERE s."tokenHash" = $1', [hash(value)]);
          return rows[0] ? { expiresAt: new Date(rows[0].expiresAt), user: { id: rows[0].id } } : null;
        },
      }),
      findMembership: async (userId,groupId) => (await db.query('SELECT "userId","groupId",role FROM "GroupMembership" WHERE "userId" = $1 AND "groupId" = $2', [userId,groupId])).rows[0] ?? null,
    });
    // Adapter executes production filters/projections; Prisma transport is not tested here.
    const model = table => ({ findMany: async args => {
      queries++;
      if (failure) throw new Error('private database details');
      assert.equal(typeof args.where.groupId, 'string');
      const fields = Object.keys(args.select).map(key => `"${key}"`).join(',');
      return (await db.query(`SELECT ${fields} FROM "${table}" WHERE "groupId" = $1 ORDER BY id`, [args.where.groupId])).rows;
    } });
    const handlers = createGroupReadHandlers({ member: model('Member'), cycle: model('Cycle') }, authorize);
    const call = (resource,groupId) => handlers[resource](new Request(`https://synthetic.invalid/api/groups/${groupId}/${resource}`), { params: Promise.resolve({ groupId }) });
    for (const resource of ['members','cycles']) {
      assert.equal((await call(resource,'a')).status,401);
      token = 'invalid';
      assert.equal((await call(resource,'a')).status,401);
      token = 'synthetic-token';
      const response = await call(resource,'a');
      assert.equal(response.status,200);
      const body = await response.json();
      assert.deepEqual(body[resource].map(row => row.id), [resource === 'members' ? 'member-a' : 'cycle-a']);
      assert.equal(JSON.stringify(body).includes('groupId'),false);
      assert.equal((await call(resource,'b')).status,403);
      assert.equal((await call(resource,'nonexistent')).status,403);
      token = undefined;
    }
    assert.equal(queries,2);
    token = 'synthetic-token';
    await db.exec('UPDATE "GroupMembership" SET role = \'MEMBER\'');
    assert.equal((await call('members','a')).status,403);
    await db.exec('DELETE FROM "GroupMembership"');
    assert.equal((await call('cycles','a')).status,403);
    assert.equal(queries,2);
    await db.exec(`INSERT INTO "GroupMembership" (id,"userId","groupId",role,"updatedAt") VALUES ('mb','u','b','ADMIN',NOW());`);
    assert.deepEqual((await (await call('members','b')).json()).members.map(x => x.id), ['member-b']);
    failure = true;
    const error = await call('members','b');
    assert.equal(error.status,500);
    assert.equal(JSON.stringify(await error.json()).includes('private'),false);
    await db.exec('UPDATE "Session" SET "expiresAt" = \'2000-01-01\'');
    assert.equal((await call('members','b')).status,401);
  } finally { await db.close(); }
});
