import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createGroupWeekCompleter} from '../lib/group-week-completion.ts';

function fixture() {
  let state={week:{id:'w',cycleId:'c',weekNumber:1,status:'OPEN',endDate:new Date('2026-10-11'),cycle:{status:'ACTIVE',daysPerWeek:7}},
    members:[{id:'cm'}],payments:Array.from({length:7},(_,dayIndex)=>({cycleMemberId:'cm',dayIndex,expectedAmount:100,paidAmount:100,status:'PAID',cycleMember:{cycleId:'c'}})),audits:[]};
  const flags={role:'ADMIN',session:true,membership:true,missing:false,auditFailure:false,conflicts:0,attempts:0};
  let time=new Date('2026-10-12T00:00:00Z');
  const db={$transaction:async(run,options)=>{
    assert.equal(options.isolationLevel,'Serializable'); flags.attempts++;
    const draft=structuredClone(state);
    const result=await run({
      session:{findFirst:async({where})=>{assert.deepEqual(where,{tokenHash:'hash',userId:'actor',expiresAt:{gt:time}});return flags.session?{id:'session'}:null;}},
      groupMembership:{findFirst:async({where})=>{assert.deepEqual(where,{userId:'actor',groupId:'ga',role:{in:['OWNER','ADMIN']}});return flags.membership?{id:'membership'}:null;}},
      week:{findFirst:async({where})=>{assert.deepEqual(where,{id:'w',cycle:{groupId:'ga'}});return flags.missing?null:structuredClone(draft.week);},update:async({where,data})=>{assert.equal(where.id,'w');Object.assign(draft.week,data);return draft.week;}},
      cycleMember:{findMany:async({where})=>{assert.deepEqual(where,{cycleId:'c',cycle:{groupId:'ga'}});return draft.members;}},
      dailyPayment:{findMany:async({where})=>{assert.deepEqual(where,{weekId:'w'});return draft.payments;}},
      auditLog:{create:async({data})=>{if(flags.auditFailure)throw Error('private details');draft.audits.push(data);}},
    });
    if(flags.conflicts-- > 0) throw Object.assign(Error('conflict'),{code:'P2034'});
    state=draft;return result;
  }};
  const handler=createGroupWeekCompleter(db,async(groupId,role)=>{
    assert.equal(role,'ADMIN');if(flags.role==='ANONYMOUS')throw Error('AUTH_REQUIRED');
    if(groupId!=='ga'||!['ADMIN','OWNER'].includes(flags.role))throw Error('FORBIDDEN');return{userId:'actor',groupId};
  },async()=> 'hash',()=>time);
  return{flags,state:()=>state,setTime:value=>{time=new Date(value);},call:(body={weekId:'w'},groupId='ga',origin='https://synthetic.invalid')=>handler(new Request(`https://synthetic.invalid/api/groups/${groupId}/weeks/complete`,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({groupId})})};
}

test('Sunday boundary preserves full contribution day; Monday completion atomically audits actor and group',async()=>{
  const f=fixture();f.setTime('2026-10-11T23:59:59.999Z');const baseline=structuredClone(f.state());
  assert.equal((await f.call()).status,409);assert.deepEqual(f.state(),baseline);
  f.setTime('2026-10-12T00:00:00Z');assert.deepEqual(await(await f.call()).json(),{id:'w',weekNumber:1,status:'ELIGIBLE'});
  assert.equal(f.state().audits.length,1);const audit=f.state().audits[0];assert.equal(audit.actorId,'actor');assert.equal(audit.action,'COMPLETE_WEEK');
  assert.deepEqual(JSON.parse(audit.beforeJson),{groupId:'ga',cycleId:'c',weekNumber:1,status:'OPEN'});
  assert.deepEqual(JSON.parse(audit.afterJson),{groupId:'ga',cycleId:'c',weekNumber:1,status:'ELIGIBLE'});
  const after=structuredClone(f.state());assert.equal((await f.call()).status,409);assert.deepEqual(f.state(),after);
});

test('permissions, expired/revoked transaction access, spoofed fields and other groups produce no writes',async()=>{
  const f=fixture();const baseline=structuredClone(f.state());
  for(const role of ['OPERATOR','MEMBER','ANONYMOUS']) {f.flags.role=role;assert.equal((await f.call()).status,role==='ANONYMOUS'?401:403);}
  f.flags.role='ADMIN';assert.equal((await f.call(undefined,'gb')).status,403);
  assert.equal((await f.call(undefined,'ga','https://other.invalid')).status,403);
  for(const body of [null,[],{}, {weekId:''},{weekId:'w',actorId:'spoof'},{weekId:'w',groupId:'gb'},{weekId:'w',status:'ELIGIBLE'}])assert.equal((await f.call(body)).status,400);
  f.flags.session=false;assert.equal((await f.call()).status,401);f.flags.session=true;
  f.flags.membership=false;assert.equal((await f.call()).status,403);f.flags.membership=true;
  f.flags.missing=true;assert.equal((await f.call()).status,404);assert.deepEqual(f.state(),baseline);
  f.flags.missing=false;f.flags.role='OWNER';assert.equal((await f.call()).status,200);
});

test('missing, partial, unpaid, misleading PAID amounts and inconsistent member/day/cycle records cannot complete',async()=>{
  const changes=[
    s=>s.payments.pop(),s=>{s.payments[0].status='PARTIAL';s.payments[0].paidAmount=20;},
    s=>{s.payments[0].status='UNPAID';s.payments[0].paidAmount=0;},s=>{s.payments[0].paidAmount=20;},
    s=>{s.payments[0].paidAmount=101;},s=>{s.payments[0].expectedAmount=0;s.payments[0].paidAmount=0;},
    s=>{s.payments[0].cycleMember.cycleId='other';},s=>{s.payments[0].cycleMemberId='foreign';},
    s=>{s.payments[0].dayIndex=7;},s=>{s.payments[0].dayIndex=-1;},s=>{s.payments[1].dayIndex=0;},
    s=>{s.members=[];s.payments=[];},s=>{s.week.cycle.status='COMPLETED';},s=>{s.week.status='PAID';},
  ];
  for(const mutate of changes){const f=fixture();mutate(f.state());const before=structuredClone(f.state());assert.equal((await f.call()).status,409);assert.deepEqual(f.state(),before);}
});

test('audit failure rolls back and serializable retries are bounded without duplicate audits',async()=>{
  const f=fixture();const baseline=structuredClone(f.state());f.flags.auditFailure=true;
  const failed=await f.call();assert.equal(failed.status,500);assert.equal(JSON.stringify(await failed.json()).includes('private'),false);assert.deepEqual(f.state(),baseline);
  f.flags.auditFailure=false;f.flags.conflicts=3;assert.equal((await f.call()).status,409);assert.deepEqual(f.state(),baseline);
  f.flags.conflicts=2;const count=f.flags.attempts;assert.equal((await f.call()).status,200);assert.equal(f.flags.attempts-count,3);assert.equal(f.state().audits.length,1);
});
