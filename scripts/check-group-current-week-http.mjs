import assert from 'node:assert/strict';

export async function checkGroupCurrentWeekHttp(base, token, ids, changeAccess) {
  async function read(groupId, expected, check, authenticated = true) {
    const response = await fetch(`${base}/api/groups/${encodeURIComponent(groupId)}/current-week`, {
      headers: authenticated ? { Cookie: `susu_session=${token}` } : {},
      redirect: 'manual', signal: AbortSignal.timeout(60000),
    });
    if (response.status !== expected) {
      const error = new Error('CURRENT_WEEK_HTTP_STATUS');
      Object.assign(error, { check, expectedStatus: expected, actualStatus: response.status });
      throw error;
    }
    return response.json();
  }
  await read(ids.groupA, 401, 'current-week-anonymous', false);
  const result = await read(ids.groupA, 200, 'current-week-staff');
  assert.equal(result.cycle.id, ids.cycleA);
  assert.equal(result.cycle.contributionPerHandDay, 50);
  assert.equal(result.cycle.daysPerWeek, 7);
  assert.equal(result.cycle.weeklyPayoutAmount, 16450);
  assert.equal(result.week.id, ids.weekA);
  assert.deepEqual(result.members, [{ id: ids.snapshotA, nameSnapshot: 'Synthetic frozen A', handsCount: 2,
    payments: [{ id: ids.paymentA, dayIndex: 0, expectedAmount: 100, paidAmount: 20, status: 'PARTIAL' }] }]);
  await read(ids.groupB, 403, 'current-week-other-group');
  await read(ids.missingGroup, 403, 'current-week-missing-group');
  await changeAccess('GROUP_B');
  assert.deepEqual(await read(ids.groupB, 200, 'current-week-no-active-cycle'), { cycle: null, week: null, members: [] });
  await changeAccess('GROUP_A');
  await changeAccess('MEMBER');
  await read(ids.groupA, 403, 'current-week-member');
  await changeAccess('REVOKED');
  await read(ids.groupA, 403, 'current-week-revoked');
  await changeAccess('EXPIRED');
  await read(ids.groupA, 401, 'current-week-expired');
}
