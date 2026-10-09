import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { checkGroupWriteHttp } from "../scripts/check-group-write-http.mjs";

test("HTTP write checker exercises successes and denials and detects a cross-group success", async () => {
  let role = 'OPERATOR';
  let leak = false;
  let created = false;
  const server = createServer(async (request,response) => {
    let text = '';
    for await (const chunk of request) text += chunk;
    const body = JSON.parse(text);
    let status = 200;
    if (request.headers.cookie !== 'susu_session=synthetic') status = 401;
    else if (role !== 'ADMIN' || request.url.includes('/b/') || request.headers.origin === 'https://other.invalid') status = 403;
    else if (body.groupId || body.actorId) status = 400;
    else if (request.method === 'PATCH' && body.id !== 'created') status = leak ? 200 : 404;
    else if (body.name === 'Other') status = 409;
    else if (request.method === 'POST') { status = 201; created = true; }
    response.writeHead(status, { 'Content-Type':'application/json' });
    response.end(JSON.stringify(status < 300 ? { member: { id:'created', active:request.method === 'POST' } } : { error:'Denied' }));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const ids = { groupA:'a', groupB:'b', memberA:'ma', memberB:'mb', legacy:'legacy', missingGroup:'missing', newName:'New', otherName:'Other' };
  const controls = { role:async value => { role=value; }, snapshot:async () => ({ original:'unchanged' }), verifyCreated:async id => { assert.equal(id,'created'); assert.equal(created,true); } };
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await checkGroupWriteHttp(base,'synthetic',ids,controls);
    role='OPERATOR'; leak=true;
    await assert.rejects(checkGroupWriteHttp(base,'synthetic',ids,controls), { code:'ERR_ASSERTION' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
