import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLocalServerLine, createLocalServerDiagnostics } from '../scripts/local-server-diagnostics.mjs';

test('server diagnostics emit fixed categories without source secrets or records',()=>{
  const secret='postgresql://private-user:private-password@private-host/db susu_session=private-token real-member-name';
  assert.deepEqual(classifyLocalServerLine(secret),[]);
  assert.deepEqual(classifyLocalServerLine(`PrismaClientInitializationError: ${secret}`),['prisma-initialization','server-error']);
  const diagnostic=createLocalServerDiagnostics();
  diagnostic.accept('stderr',`Group current-week page read fai`);
  diagnostic.accept('stderr',`led ${secret}\nError: ${secret}\n`);
  diagnostic.accept('stdout',`Failed to compile ${secret}`);
  assert.deepEqual(diagnostic.summary(),{'group-page-read-failed':1,'server-error':1,'compile-or-module':1});
  assert.equal(JSON.stringify(diagnostic.summary()).includes('private'),false);
  assert.deepEqual(diagnostic.summary(),diagnostic.summary());
});
