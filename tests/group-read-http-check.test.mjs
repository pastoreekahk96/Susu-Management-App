import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { checkGroupReadHttp } from "../scripts/check-group-read-http.mjs";

test("live checker handles cookie, denial, revocation and expiry responses and catches leaked resources", async () => {
  let state = "OPERATOR";
  let leak = false;
  const server = createServer((request, response) => {
    const [, , , groupId, resource] = request.url.split('/');
    let status = 200;
    let body;
    if (request.headers.cookie !== 'susu_session=synthetic' || state === 'EXPIRED') status = 401;
    else if (groupId !== 'a' || state !== 'OPERATOR') status = 403;
    if (status === 200) body = { [resource]: [{ id: leak ? 'other-group-record' : resource === 'members' ? 'ma' : 'ca' }] };
    else body = { error: 'Denied' };
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ids = { groupA: 'a', groupB: 'b', missingGroup: 'missing', memberA: 'ma', cycleA: 'ca' };
  try {
    await checkGroupReadHttp(base, 'synthetic', ids, async next => { state = next; });
    state = 'OPERATOR'; leak = true;
    await assert.rejects(checkGroupReadHttp(base, 'synthetic', ids, async next => { state = next; }), { code: 'ERR_ASSERTION' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
