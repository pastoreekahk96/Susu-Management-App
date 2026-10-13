import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGroupPayoutOptionsHandler } from '../lib/group-payout-options.ts';
import { createGroupAuthorizer } from '../lib/group-authorization.ts';

const call=(handler,groupId='a')=>handler(new Request('http://localhost'),{params:Promise.resolve({groupId})});

test('payout options require group ADMIN/OWNER and never infer membership from global ADMIN',async()=>{
  let role='ADMIN',globalRole='VIEWER',signedIn=true,reads=0;
  const db={cycle:{findFirst:async()=>{reads++;return null;}}};
  const handler=createGroupPayoutOptionsHandler(db,createGroupAuthorizer({
    getCurrentUser:async()=>signedIn?{id:'user',role:globalRole}:null,
    findMembership:async(userId,groupId)=>groupId==='a'?{userId,groupId,role}:null,
  }));
  for(const allowed of ['ADMIN','OWNER']) {
    role=allowed;const response=await call(handler);
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.deepEqual(await response.json(),{weeks:[],members:[]});
  }
  globalRole='ADMIN';const baseline=reads;
  for(const denied of ['OPERATOR','MEMBER']) {role=denied;assert.equal((await call(handler)).status,403);}
  assert.equal((await call(handler,'b')).status,403);
  signedIn=false;assert.equal((await call(handler)).status,401);
  assert.equal(reads,baseline);
});

test('options preserve frozen member names and per-hand counts with scoped eligible weeks only',async()=>{
  const date=new Date('2026-10-05');
  const cycles=[{id:'ca',groupId:'a',status:'ACTIVE',weeklyPayoutAmount:16450},{id:'cb',groupId:'b',status:'ACTIVE',weeklyPayoutAmount:999}];
  const weeks=[
    {id:'eligible',cycleId:'ca',status:'ELIGIBLE',payout:null,weekNumber:1,startDate:date,endDate:new Date('2026-10-11')},
    {id:'open',cycleId:'ca',status:'OPEN',payout:null},
    {id:'paid',cycleId:'ca',status:'PAID',payout:'payout'},
    {id:'inconsistent',cycleId:'ca',status:'ELIGIBLE',payout:'payout'},
    {id:'foreign',cycleId:'cb',status:'ELIGIBLE',payout:null},
  ];
  const hands=[
    {id:'h1',cycleId:'ca',status:'PENDING',payout:null},
    {id:'h2',cycleId:'ca',status:'PENDING',payout:null},
    {id:'selected',cycleId:'ca',status:'SELECTED',payout:'payout'},
    {id:'misleading',cycleId:'ca',status:'PENDING',payout:'payout'},
    {id:'foreign-hand',cycleId:'cb',status:'PENDING',payout:null},
  ];
  const matchesCycle=(cycleId,condition)=>cycles.some(c=>c.id===cycleId&&c.groupId===condition.groupId&&c.status===condition.status);
  const db={
    cycle:{findFirst:async({where})=>cycles.find(c=>c.groupId===where.groupId&&c.status===where.status)},
    week:{findMany:async({where})=>weeks.filter(w=>w.cycleId===where.cycleId&&w.status===where.status&&w.payout===where.payout&&matchesCycle(w.cycleId,where.cycle)).map(({id,weekNumber,startDate,endDate})=>({id,weekNumber,startDate,endDate}))},
    cycleMember:{findMany:async({where,select})=>{
      if(where.cycleId!=='ca'||!matchesCycle('ca',where.cycle))return [];
      const filter=select.hands.where;
      return [{id:'snapshot',nameSnapshot:'Frozen member',hands:hands.filter(h=>h.cycleId===filter.cycleId&&h.status===filter.status&&h.payout===filter.payout&&matchesCycle(h.cycleId,filter.cycle))}];
    }},
  };
  const baseline=JSON.stringify({cycles,weeks,hands});
  const handler=createGroupPayoutOptionsHandler(db,async groupId=>({groupId}));
  const response=await call(handler);
  assert.deepEqual(await response.json(),{
    weeks:[{id:'eligible',weekNumber:1,startDate:'2026-10-05',endDate:'2026-10-11',amount:16450}],
    members:[{id:'snapshot',name:'Frozen member',pendingHands:2}],
  });
  assert.equal(JSON.stringify({cycles,weeks,hands}),baseline);
});

test('database failures return generic uncached errors without underlying data',async t=>{
  t.mock.method(console,'error',()=>{});
  const handler=createGroupPayoutOptionsHandler({cycle:{findFirst:async()=>{throw Error('private-password real-member');}}},async groupId=>({groupId}));
  const response=await call(handler);assert.equal(response.status,500);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.deepEqual(await response.json(),{error:'Unable to load group payout options.'});
});
