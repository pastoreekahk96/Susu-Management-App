import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkGroupCurrentWeekHttp } from '../scripts/check-group-current-week-http.mjs';

const ids = { groupA: 'a', groupB: 'b', missingGroup: 'missing', cycleA: 'ca', weekA: 'wa', snapshotA: 'sa', paymentA: 'pa' };
function mockServer(t, changeResult = value => value) {
  let access = 'GROUP_A';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const group = new URL(url).pathname.split('/')[3];
    const status = !options.headers.Cookie || access === 'EXPIRED' ? 401
      : ['MEMBER', 'REVOKED'].includes(access) || group !== (access === 'GROUP_B' ? 'b' : 'a') ? 403 : 200;
    const body = status !== 200 ? { error: 'Denied' } : group === 'b' ? { cycle: null, week: null, members: [] }
      : changeResult({ cycle: { id: 'ca', contributionPerHandDay: 50, daysPerWeek: 7, weeklyPayoutAmount: 16450 }, week: { id: 'wa' },
        members: [{ id: 'sa', nameSnapshot: 'Synthetic frozen A', handsCount: 2, payments: [{ id: 'pa', dayIndex: 0, expectedAmount: 100, paidAmount: 20, status: 'PARTIAL' }] }] });
    return Response.json(body, { status });
  });
  return async state => { access = state; };
}
test('live checker covers permission changes and no-active-cycle response', async t => {
  await checkGroupCurrentWeekHttp('http://localhost', 'synthetic', ids, mockServer(t));
});
test('live checker rejects leaked member rows', async t => {
  const access = mockServer(t, body => ({ ...body, members: [...body.members, { id: 'foreign' }] }));
  await assert.rejects(checkGroupCurrentWeekHttp('http://localhost', 'synthetic', ids, access), { name: 'AssertionError' });
});
test('live checker rejects altered partial payment amounts', async t => {
  const access = mockServer(t, body => {
    body.members[0].payments[0].paidAmount = 100;
    return body;
  });
  await assert.rejects(checkGroupCurrentWeekHttp('http://localhost', 'synthetic', ids, access), { name: 'AssertionError' });
});
