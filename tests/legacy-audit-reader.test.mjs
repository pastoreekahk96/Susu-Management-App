import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLegacyAuditReader } from '../lib/legacy-audit-reader.ts';

function fixture({ groups = [], rows = [], authError, databaseError } = {}) {
  const calls = [];
  const db = {
    $transaction: async (read, options) => {
      calls.push(['transaction', options]);
      return read({
        group: { findFirst: async args => {
          calls.push(['groups', args]);
          if (databaseError) throw databaseError;
          return groups[0] ?? null;
        } },
        auditLog: { findMany: async args => {
          calls.push(['audit', args]);
          return rows;
        } },
      });
    },
  };
  const read = createLegacyAuditReader(db, async role => {
    calls.push(['authorize', role]);
    if (authError) throw new Error(authError);
    return { id: 'global-admin', role: 'ADMIN' };
  });
  return { read, calls };
}

test('anonymous and non-admin users cannot start an audit database read', async () => {
  for (const authError of ['AUTH_REQUIRED', 'FORBIDDEN']) {
    const { read, calls } = fixture({ authError });
    await assert.rejects(read, { message: authError });
    assert.deepEqual(calls, [['authorize', 'ADMIN']]);
  }
});

test('any configured group blocks the global viewer before audit details are queried', async () => {
  // An empty group is enough: audit access never depends on an active cycle,
  // the global admin's memberships, or which actor created a record.
  for (const groups of [[{ id: 'foreign-group' }], [{ id: 'own-group' }]]) {
    const { read, calls } = fixture({ groups, rows: [
      { id: 'foreign-audit', beforeJson: 'private financial details' },
      { id: 'legacy-audit', afterJson: 'legacy details' },
    ] });
    await assert.rejects(read, { message: 'LEGACY_AUDIT_UNAVAILABLE' });
    assert.equal(calls.some(([operation]) => operation === 'audit'), false);
  }
});

test('original ungrouped admin history remains bounded and uses one consistent snapshot', async () => {
  const rows = [{ id: 'legacy-payment', action: 'UPDATE_DAILY_PAYMENT', actor: { name: 'Legacy admin' } }];
  const { read, calls } = fixture({ rows });
  assert.deepEqual(await read(), rows);
  assert.deepEqual(calls.map(([operation]) => operation), ['authorize', 'transaction', 'groups', 'audit']);
  assert.deepEqual(calls[1][1], { isolationLevel: 'RepeatableRead' });
  assert.deepEqual(calls[2][1], { select: { id: true } });
  const query = calls[3][1];
  assert.equal(query.take, 100);
  assert.deepEqual(query.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.deepEqual(query.select.actor, { select: { name: true, email: true, role: true } });
  assert.equal(query.select.actor.select.passwordHash, undefined);
});

test('empty legacy history succeeds and a failed group check never falls back to global history', async () => {
  assert.deepEqual(await fixture().read(), []);
  const failure = new Error('database unavailable');
  const { read, calls } = fixture({ databaseError: failure });
  await assert.rejects(read, error => error === failure);
  assert.equal(calls.some(([operation]) => operation === 'audit'), false);
});
