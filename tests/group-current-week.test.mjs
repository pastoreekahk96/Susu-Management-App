import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGroupCurrentWeekHandler, selectCurrentWeek } from '../lib/group-current-week.ts';
import { createGroupAuthorizer } from '../lib/group-authorization.ts';

const weeks = [
  { id: 'w1', startDate: new Date('2026-09-14'), endDate: new Date('2026-09-20') },
  { id: 'w2', startDate: new Date('2026-09-21'), endDate: new Date('2026-09-27') },
];
test('current week preserves UTC Sunday, Monday and calendar fallback behavior', () => {
  for (const [date, expected] of [
    ['2026-09-13', 'w1'], ['2026-09-20T23:59:59Z', 'w1'],
    ['2026-09-21T00:00:00Z', 'w2'], ['2026-09-28', 'w2'],
  ]) assert.equal(selectCurrentWeek(weeks, new Date(date)).id, expected);
  assert.equal(selectCurrentWeek([], new Date()), null);
  assert.equal(selectCurrentWeek([weeks[0], { ...weeks[1], startDate: new Date('2026-09-23') }], new Date('2026-09-22')), null);
});

test('current-week handler denies absent sessions, other groups and member roles before querying', async () => {
  let role = 'OPERATOR', signedIn = true, reads = 0;
  const db = { cycle: { findFirst: async () => { reads++; return null; } }, cycleMember: { findMany: async () => { throw Error('unexpected'); } } };
  const handler = createGroupCurrentWeekHandler(db, createGroupAuthorizer({
    getCurrentUser: async () => signedIn ? { id: 'staff' } : null,
    findMembership: async (userId, groupId) => groupId === 'a' ? { userId, groupId, role } : null,
  }));
  const call = groupId => handler(new Request('http://localhost'), { params: Promise.resolve({ groupId }) });
  assert.equal((await call('b')).status, 403);
  role = 'MEMBER'; assert.equal((await call('a')).status, 403);
  signedIn = false; assert.equal((await call('a')).status, 401);
  assert.equal(reads, 0);
  signedIn = true; role = 'OPERATOR';
  assert.deepEqual(await (await call('a')).json(), { cycle: null, week: null, members: [] });
});

test('resource queries constrain both payment relation paths and preserve partial cash amounts', async () => {
  const db = {
    cycle: { findFirst: async args => {
      assert.deepEqual(args.where, { groupId: 'a', status: 'ACTIVE' });
      assert.equal(args.select.weeks.orderBy.weekNumber, 'asc');
      return { id: 'cycle-a', contributionPerHandDay: 50, daysPerWeek: 7, weeks };
    } },
    cycleMember: { findMany: async args => {
      assert.deepEqual(args.where, { cycleId: 'cycle-a', cycle: { groupId: 'a' } });
      assert.deepEqual(args.select.payments.where, { weekId: 'w1', week: { cycleId: 'cycle-a', cycle: { groupId: 'a' } } });
      assert.deepEqual(Object.keys(args.select), ['id', 'nameSnapshot', 'handsCount', 'payments']);
      return [{ id: 'snapshot-a', nameSnapshot: 'Frozen name', handsCount: 2,
        payments: [{ id: 'payment-a', dayIndex: 0, expectedAmount: 100, paidAmount: 20, status: 'PARTIAL' }] }];
    } },
  };
  const handler = createGroupCurrentWeekHandler(db, async (groupId, role) => {
    assert.equal(role, 'OPERATOR'); return { groupId };
  }, () => new Date('2026-09-20T23:59:59Z'));
  const response = await handler(new Request('http://localhost'), { params: Promise.resolve({ groupId: 'a' }) });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.week.id, 'w1');
  assert.equal(result.cycle.weeks, undefined);
  assert.equal(result.members[0].payments[0].paidAmount, 20);
  assert.equal(result.members[0].nameSnapshot, 'Frozen name');
});
