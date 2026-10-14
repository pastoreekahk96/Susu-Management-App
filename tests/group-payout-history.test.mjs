import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createGroupPayoutHistoryHandler} from '../lib/group-payout-history.ts';
import {createGroupAuthorizer} from '../lib/group-authorization.ts';
const call=(handler,query='',groupId='a')=>handler(new Request(`http://localhost/history${query}`),{params:Promise.resolve({groupId})});
const row=id=>({id,week:{cycleId:'ca'},hand:{cycleId:'ca',cycleMember:{cycleId:'ca'}}});
test('history authorizes staff membership independently of global role before database reads',async()=>{
  let role='OPERATOR',signedIn=true,reads=0;
  const handler=createGroupPayoutHistoryHandler({payout:{findMany:async()=>{reads++;return [];}}},createGroupAuthorizer({getCurrentUser:async()=>signedIn?{id:'u',role:'ADMIN'}:null,findMembership:async(userId,groupId)=>groupId==='a'?{userId,groupId,role}:null}));
  for(role of ['OPERATOR','ADMIN','OWNER'])assert.equal((await call(handler)).status,200);
  const count=reads;role='MEMBER';assert.equal((await call(handler)).status,403);assert.equal((await call(handler,'','b')).status,403);
  signedIn=false;assert.equal((await call(handler)).status,401);assert.equal(reads,count);
});
test('history scopes all relations, bounds pagination and excludes authentication fields',async()=>{
  let args;
  const handler=createGroupPayoutHistoryHandler({payout:{findMany:async query=>{args=query;return Array.from({length:101},(_,i)=>row(`p${i}`));},findFirst:async query=>query.where.id==='owned'?{id:'owned'}:null}},async groupId=>({groupId}));
  const response=await call(handler,'?cursor=owned'),body=await response.json();
  assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(body.payouts.length,100);assert.equal(body.nextCursor,'p99');
  assert.deepEqual(args.where,{week:{cycle:{groupId:'a'}},hand:{cycle:{groupId:'a'},cycleMember:{cycle:{groupId:'a'}}}});
  assert.deepEqual(args.orderBy,[{drawnAt:'desc'},{id:'desc'}]);assert.equal(args.take,101);assert.equal(args.skip,1);assert.deepEqual(args.cursor,{id:'owned'});
  assert.deepEqual(args.select.recordedBy,{select:{id:true,name:true}});
  assert.equal((await call(handler,'?cursor=foreign')).status,404);
  for(const query of ['?cursor=','?cursor=a&cursor=b','?groupId=b'])assert.equal((await call(handler,query)).status,400);
});
test('empty history terminates pagination and corrupt cross-cycle records fail without leaking data',async t=>{
  t.mock.method(console,'error',()=>{});let rows=[];
  const handler=createGroupPayoutHistoryHandler({payout:{findMany:async()=>rows}},async groupId=>({groupId}));
  assert.deepEqual(await (await call(handler)).json(),{payouts:[],nextCursor:null});
  rows=[row('secret')];rows[0].hand.cycleMember.cycleId='cb';const response=await call(handler);
  assert.equal(response.status,500);assert.deepEqual(await response.json(),{error:'Unable to load group payout history.'});
});
