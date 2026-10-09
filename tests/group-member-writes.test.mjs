import assert from "node:assert/strict";
import { test } from "node:test";
import { createGroupMemberWrites } from "../lib/group-member-writes.ts";

test("member writes scope updates, enforce authority, reject reassignment and atomically audit", async () => {
  let state = { members: [
    { id: 'a', name: 'A', active: true, groupId: 'ga' },
    { id: 'b', name: 'B', active: true, groupId: 'gb' },
    { id: 'legacy', name: 'Legacy', active: true, groupId: null },
  ], audits: [] };
  let role = 'ADMIN';
  let membership = true;
  let failAudit = false;
  let transactions = 0;
  const matches = (row, where) => Object.entries(where).every(([key,value]) => row[key] === value);
  const db = { $transaction: async (run, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    transactions++;
    const draft = structuredClone(state);
    const tx = {
      groupMembership: { findFirst: async args => {
        assert.deepEqual(args.where, { userId: 'actor', groupId: 'ga', role: { in: ['OWNER','ADMIN'] } });
        return membership ? { id: 'membership' } : null;
      } },
      member: {
        findFirst: async ({where}) => draft.members.find(row => matches(row,where)) ?? null,
        findFirstOrThrow: async ({where}) => { const row = draft.members.find(row => matches(row,where)); assert.ok(row); return row; },
        create: async ({data}) => {
          if (draft.members.some(row => row.name === data.name)) throw Object.assign(new Error('private'), { code: 'P2002' });
          const row = { id: 'created', ...data }; draft.members.push(row); return row;
        },
        updateMany: async ({where,data}) => {
          assert.equal(where.groupId,'ga');
          const row = draft.members.find(row => matches(row,where));
          if (!row) return { count: 0 };
          Object.assign(row,data); return { count: 1 };
        },
      },
      auditLog: { create: async ({data}) => { if (failAudit) throw new Error('private database details'); draft.audits.push(data); } },
    };
    const result = await run(tx); state = draft; return result;
  } };
  const handlers = createGroupMemberWrites(db, async (groupId,required) => {
    assert.equal(required,'ADMIN');
    if (role === 'ANONYMOUS') throw new Error('AUTH_REQUIRED');
    if (!['ADMIN','OWNER'].includes(role) || groupId !== 'ga') throw new Error('FORBIDDEN');
    return { userId:'actor', groupId };
  });
  const call = (method,body, groupId='ga', origin='https://synthetic.invalid') => handlers[method](
    new Request(`https://synthetic.invalid/api/groups/${groupId}/members`, { method, headers: { origin, 'Content-Type':'application/json' }, body: JSON.stringify(body) }),
    { params: Promise.resolve({groupId}) });
  assert.equal((await call('POST',{name:'   New   Person  '})).status,201);
  assert.equal(state.members.at(-1).groupId,'ga');
  assert.equal(state.members.at(-1).name,'New Person');
  assert.equal(state.audits[0].actorId,'actor');
  assert.equal(JSON.parse(state.audits[0].afterJson).groupId,'ga');
  assert.equal((await call('PATCH',{id:'a',name:'Renamed',active:false})).status,200);
  assert.equal(state.members[0].active,false);
  const baseline = structuredClone(state);
  for (const id of ['b','legacy','absent']) assert.equal((await call('PATCH',{id,active:false})).status,404);
  assert.equal((await call('POST',{name:'X',groupId:'gb'})).status,400);
  assert.equal((await call('PATCH',{id:'a',actorId:'spoof',active:true})).status,400);
  assert.equal((await call('PATCH',{id:'a'})).status,400);
  assert.equal((await call('POST',{name:'B'})).status,409);
  assert.deepEqual(state,baseline);
  const count = transactions;
  assert.equal((await call('POST',{name:'X'},'ga','https://other.invalid')).status,403);
  for (const denied of ['OPERATOR','MEMBER','ANONYMOUS']) {
    role = denied;
    assert.equal((await call('POST',{name:'X'})).status,denied === 'ANONYMOUS' ? 401 : 403);
  }
  role='ADMIN';
  assert.equal((await call('POST',{name:'X'},'gb')).status,403);
  assert.equal(transactions,count);
  membership=false;
  assert.equal((await call('POST',{name:'X'})).status,403);
  membership=true; failAudit=true;
  const failed = await call('PATCH',{id:'a',active:true});
  assert.equal(failed.status,500);
  assert.equal(JSON.stringify(await failed.json()).includes('private'),false);
  assert.deepEqual(state,baseline);
});
