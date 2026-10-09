import assert from "node:assert/strict";

export async function checkGroupReadHttp(baseUrl, token, ids, changeAccess) {
  async function read(resource, groupId, authenticated = true) {
    const response = await fetch(`${baseUrl}/api/groups/${encodeURIComponent(groupId)}/${resource}`, {
      headers: authenticated ? { Cookie: `susu_session=${token}` } : {},
      redirect: "manual", signal: AbortSignal.timeout(60000),
    });
    return { status: response.status, body: await response.json() };
  }
  for (const resource of ["members", "cycles"]) {
    assert.equal((await read(resource, ids.groupA, false)).status, 401);
    const allowed = await read(resource, ids.groupA);
    assert.equal(allowed.status, 200);
    assert.deepEqual(allowed.body[resource].map(row => row.id), [resource === "members" ? ids.memberA : ids.cycleA]);
    assert.equal((await read(resource, ids.groupB)).status, 403);
    assert.equal((await read(resource, ids.missingGroup)).status, 403);
  }
  await changeAccess("MEMBER");
  assert.equal((await read("members", ids.groupA)).status, 403);
  await changeAccess("REVOKED");
  assert.equal((await read("cycles", ids.groupA)).status, 403);
  await changeAccess("EXPIRED");
  assert.equal((await read("members", ids.groupA)).status, 401);
}
