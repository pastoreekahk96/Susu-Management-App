import assert from "node:assert/strict";

export async function checkGroupWriteHttp(base, token, ids, control) {
  async function write(method, groupId, body, { authenticated = true, origin = base } = {}) {
    const response = await fetch(`${base}/api/groups/${encodeURIComponent(groupId)}/members`, {
      method, headers: { 'Content-Type': 'application/json', Origin: origin,
        ...(authenticated ? { Cookie: `susu_session=${token}` } : {}) },
      body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(60000),
    });
    return { status: response.status, body: await response.json() };
  }
  const before = await control.snapshot();
  const name = ids.newName;
  assert.equal((await write('POST', ids.groupA, { name }, { authenticated: false })).status, 401);
  assert.equal((await write('POST', ids.groupA, { name })).status, 403); // OPERATOR
  await control.role('ADMIN');
  assert.equal((await write('POST', ids.groupB, { name })).status, 403);
  assert.equal((await write('POST', ids.groupA, { name }, { origin: 'https://other.invalid' })).status, 403);
  for (const id of [ids.memberB, ids.legacy, ids.missingGroup]) {
    assert.equal((await write('PATCH', ids.groupA, { id, active: false })).status, 404);
  }
  assert.equal((await write('POST', ids.groupA, { name, groupId: ids.groupB })).status, 400);
  assert.equal((await write('PATCH', ids.groupA, { id: ids.memberA, active: false, actorId: 'spoof' })).status, 400);
  assert.equal((await write('POST', ids.groupA, { name: ids.otherName })).status, 409);
  assert.deepEqual(await control.snapshot(), before);
  const created = await write('POST', ids.groupA, { name });
  assert.equal(created.status, 201);
  assert.equal(typeof created.body.member.id, 'string');
  const edited = await write('PATCH', ids.groupA, { id: created.body.member.id, name: `${name} edited`, active: false });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.member.active, false);
  await control.verifyCreated(created.body.member.id, `${name} edited`);
  await control.role('MEMBER');
  assert.equal((await write('PATCH', ids.groupA, { id: ids.memberA, active: false })).status, 403);
}
