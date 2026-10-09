import assert from "node:assert/strict";

export async function checkGroupWriteHttp(base, token, ids, control) {
  async function write(method, groupId, body, { authenticated = true, origin = control.origin ?? base } = {}) {
    const response = await fetch(`${base}/api/groups/${encodeURIComponent(groupId)}/members`, {
      method, headers: { 'Content-Type': 'application/json', Origin: origin,
        ...(authenticated ? { Cookie: `susu_session=${token}` } : {}) },
      body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(60000),
    });
    return { status: response.status, body: await response.json() };
  }
  function statusCheck(response, expected, check) {
    try { assert.equal(response.status, expected); }
    catch (error) { error.check = check; error.expectedStatus = expected; error.actualStatus = response.status; throw error; }
  }
  const before = await control.snapshot();
  const name = ids.newName;
  statusCheck(await write('POST', ids.groupA, { name }, { authenticated: false }), 401, 'anonymous-create');
  statusCheck(await write('POST', ids.groupA, { name }), 403, 'operator-create'); // OPERATOR
  await control.role('ADMIN');
  statusCheck(await write('POST', ids.groupB, { name }), 403, 'other-group-create');
  statusCheck(await write('POST', ids.groupA, { name }, { origin: 'https://other.invalid' }), 403, 'cross-origin-create');
  for (const id of [ids.memberB, ids.legacy, ids.missingGroup]) {
    statusCheck(await write('PATCH', ids.groupA, { id, active: false }), 404, 'out-of-scope-edit');
  }
  statusCheck(await write('POST', ids.groupA, { name, groupId: ids.groupB }), 400, 'group-reassignment');
  statusCheck(await write('PATCH', ids.groupA, { id: ids.memberA, active: false, actorId: 'spoof' }), 400, 'actor-spoof');
  statusCheck(await write('POST', ids.groupA, { name: ids.otherName }), 409, 'duplicate-name');
  assert.deepEqual(await control.snapshot(), before);
  const created = await write('POST', ids.groupA, { name });
  statusCheck(created, 201, 'authorized-create');
  assert.equal(typeof created.body.member.id, 'string');
  const edited = await write('PATCH', ids.groupA, { id: created.body.member.id, name: `${name} edited`, active: false });
  statusCheck(edited, 200, 'authorized-edit');
  assert.equal(edited.body.member.active, false);
  await control.verifyCreated(created.body.member.id, `${name} edited`);
  await control.role('MEMBER');
  statusCheck(await write('PATCH', ids.groupA, { id: ids.memberA, active: false }), 403, 'member-edit');
}
