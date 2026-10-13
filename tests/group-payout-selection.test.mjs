import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGroupPayoutSelector } from '../lib/group-payout-selection.ts';

function fixture() {
  const counts=[4,1,1,1,2,10,2,3,2,2,4,2,4,5,4];
  const members=counts.map((handsCount,i)=>({id:`cm${i}`,handsCount}));
  let number=0;
  let state={week:{id:'w',cycleId:'c',weekNumber:1,status:'ELIGIBLE',endDate:new Date('2026-10-11'),cycle:{groupId:'ga',status:'ACTIVE',daysPerWeek:7,contributionPerHandDay:50,numberOfWeeks:47,totalHandsSnapshot:47,weeklyPayoutAmount:16450}},
    members,hands:members.flatMap(m=>Array.from({length:m.handsCount},()=>({id:`h${++number}`,handNumber:number,status:'PENDING',cycleMemberId:m.id,cycleMember:{cycleId:'c',nameSnapshot:`Frozen ${m.id}`},payout:null}))),
    payments:members.flatMap(m=>Array.from({length:7},(_,dayIndex)=>({cycleMemberId:m.id,dayIndex,expectedAmount:m.handsCount*50,paidAmount:m.handsCount*50,status:'PAID',cycleMember:{cycleId:'c'}}))),payouts:[],audits:[]};
  const flags={role:'ADMIN',session:true,membership:true,token:true,missing:false,auditFailure:false,handRace:false,weekRace:false,conflicts:0,attempts:0,unique:false,choice:0};
  let time=new Date('2026-10-12T00:00:00Z');
  const db={$transaction:async(run,options)=>{
    assert.equal(options.isolationLevel,'Serializable');flags.attempts++;
    const draft=structuredClone(state);
    const result=await run({
      session:{findFirst:async({where})=>{assert.deepEqual(where,{tokenHash:'hash',userId:'actor',expiresAt:{gt:time}});return flags.session?{id:'session'}:null;}},
      groupMembership:{findFirst:async({where})=>{assert.deepEqual(where,{userId:'actor',groupId:'ga',role:{in:['OWNER','ADMIN']}});return flags.membership?{id:'membership'}:null;}},
      week:{findFirst:async({where})=>{assert.deepEqual(where,{id:'w',cycle:{groupId:'ga'}});return flags.missing?null:draft.week;},updateMany:async({where,data})=>{
        assert.equal(where.cycleId,'c');assert.deepEqual(where.cycle,{groupId:'ga',status:'ACTIVE'});
        if(flags.weekRace||draft.week.status!==where.status)return{count:0};Object.assign(draft.week,data);return{count:1};}},
      cycleMember:{findMany:async()=>draft.members},dailyPayment:{findMany:async()=>draft.payments},
      cycleHand:{findMany:async({where})=>{assert.deepEqual(where,{cycleId:'c'});return draft.hands;},updateMany:async({where,data})=>{
        assert.equal(where.cycleId,'c');assert.equal(where.payout,null);
        const hand=draft.hands.find(h=>h.id===where.id&&h.cycleMemberId===where.cycleMemberId&&h.status===where.status);
        if(!hand||flags.handRace)return{count:0};Object.assign(hand,data);return{count:1};}},
      payout:{findUnique:async()=>draft.payouts[0]??null,create:async({data})=>{
        if(flags.unique)throw Object.assign(Error('private unique metadata'),{code:'P2002'});
        const payout={id:'payout',drawnAt:time,...data};draft.payouts.push(payout);
        draft.hands.find(h=>h.id===data.handId).payout={amount:data.amount,week:{cycleId:'c',status:'PAID'}};return payout;}},
      auditLog:{create:async({data})=>{if(flags.auditFailure)throw Error('private-password');draft.audits.push(data);}},
    });
    if(flags.conflicts-- > 0)throw Object.assign(Error('conflict'),{code:'P2034'});
    state=draft;return result;
  }};
  const handler=createGroupPayoutSelector(db,async(groupId,required)=>{
    assert.equal(required,'ADMIN');if(flags.role==='ANONYMOUS')throw Error('AUTH_REQUIRED');
    if(groupId!=='ga'||!['ADMIN','OWNER'].includes(flags.role))throw Error('FORBIDDEN');return{userId:'actor',groupId};
  },async()=>flags.token?'hash':null,()=>time,size=>{assert.ok(size>0);return flags.choice;});
  return{flags,state:()=>state,setTime:date=>{time=new Date(date);},call:(body={weekId:'w',method:'RANDOM'},groupId='ga',origin='https://synthetic.invalid')=>handler(new Request(`https://synthetic.invalid/api/groups/${groupId}/payouts`,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({groupId})})};
}

test('random selection selects exactly one pending hand, fixed amount and authenticated group audit',async()=>{
  const f=fixture();f.flags.choice=46;const payments=structuredClone(f.state().payments);
  const response=await f.call();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const result=await response.json();assert.equal(result.handId,'h47');assert.equal(result.amount,16450);assert.equal(result.memberName,'Frozen cm14');assert.equal(result.status,'DRAWN');
  assert.equal(f.state().hands.filter(h=>h.status==='SELECTED').length,1);assert.equal(f.state().week.status,'PAID');assert.deepEqual(f.state().payments,payments);
  assert.equal(f.state().payouts[0].recordedById,'actor');assert.equal(f.state().audits.length,1);
  const audit=f.state().audits[0];assert.equal(audit.action,'RANDOM_PAYOUT');assert.equal(audit.actorId,'actor');
  assert.equal(JSON.parse(audit.afterJson).groupId,'ga');assert.equal(JSON.parse(audit.afterJson).cycleId,'c');
  const after=structuredClone(f.state());assert.equal((await f.call()).status,409);assert.deepEqual(f.state(),after);
});

test('manual selection awards one of a ten-hand member’s hands and stores a trimmed reason',async()=>{
  const f=fixture();f.flags.role='OWNER';f.flags.choice=9;
  const response=await f.call({weekId:'w',method:'MANUAL',memberId:'cm5',reason:'  Emergency  '});assert.equal(response.status,200);
  assert.equal((await response.json()).memberName,'Frozen cm5');assert.equal(f.state().hands.filter(h=>h.cycleMemberId==='cm5'&&h.status==='PENDING').length,9);
  assert.equal(f.state().payouts[0].manualReason,'Emergency');assert.equal(f.state().audits[0].action,'MANUAL_PAYOUT');
});

test('permissions, request spoofing and fresh transactional access deny without financial changes',async()=>{
  const f=fixture();const baseline=structuredClone(f.state());
  for(const role of ['ANONYMOUS','MEMBER','OPERATOR']){f.flags.role=role;assert.equal((await f.call()).status,role==='ANONYMOUS'?401:403);}f.flags.role='ADMIN';
  assert.equal((await f.call(undefined,'gb')).status,403);assert.equal((await f.call(undefined,'ga','https://other.invalid')).status,403);
  for(const body of [null,[],{}, {weekId:'w',method:'OTHER'},{weekId:'w',method:'RANDOM',amount:16450},{weekId:'w',method:'RANDOM',actorId:'spoof'},
    {weekId:'w',method:'RANDOM',memberId:''},{weekId:'w',method:'RANDOM',reason:null},{weekId:'w',method:'MANUAL',memberId:'cm5',reason:' '},
    {weekId:'w',method:'MANUAL',memberId:'cm5',reason:'x'.repeat(501)},{weekId:'w',method:'MANUAL',memberId:5,reason:'test'}])assert.equal((await f.call(body)).status,400);
  f.flags.session=false;assert.equal((await f.call()).status,401);f.flags.session=true;
  f.flags.membership=false;assert.equal((await f.call()).status,403);f.flags.membership=true;
  f.flags.token=false;assert.equal((await f.call()).status,401);f.flags.token=true;
  f.flags.missing=true;assert.equal((await f.call()).status,404);f.flags.missing=false;
  assert.equal((await f.call({weekId:'w',method:'MANUAL',memberId:'foreign',reason:'test'})).status,404);
  assert.deepEqual(f.state(),baseline);
});

test('Sunday boundary, invalid snapshots, missing hands, foreign links and inconsistent payments reject atomically',async()=>{
  const changes=[s=>{s.week.status='OPEN';},s=>{s.week.cycle.status='COMPLETED';},s=>{s.week.cycle.weeklyPayoutAmount=1;},
    s=>{s.week.weekNumber=0;},s=>{s.members[0].handsCount=3;},s=>s.hands.pop(),s=>{s.hands[0].cycleMember.cycleId='foreign';},
    s=>{s.hands[0].cycleMemberId='foreign';},s=>{s.hands[0].handNumber=0;},s=>{s.hands[1].handNumber=1;},
    s=>{s.hands[0].status='SELECTED';},s=>{s.hands[0].payout={amount:16450,week:{cycleId:'foreign',status:'PAID'}};},
    s=>s.payments.pop(),s=>{s.payments[0].paidAmount=20;},s=>{s.payments[0].status='PARTIAL';},s=>{s.payments[0].cycleMemberId='foreign';},
    s=>{s.payments[0].cycleMember.cycleId='foreign';},s=>{s.payments[1].dayIndex=0;},s=>{s.payments[0].expectedAmount=1;s.payments[0].paidAmount=1;},
  ];
  for(const mutate of changes){const f=fixture();mutate(f.state());const before=structuredClone(f.state());assert.equal((await f.call()).status,409);assert.deepEqual(f.state(),before);}
  const f=fixture();f.setTime('2026-10-11T23:59:59.999Z');assert.equal((await f.call()).status,409);
});

test('previously paid hands are excluded and depleted manual member is rejected',async()=>{
  const f=fixture();for(const hand of f.state().hands.filter(h=>h.cycleMemberId==='cm0')){hand.status='SELECTED';hand.payout={amount:16450,week:{cycleId:'c',status:'PAID'}};}
  const baseline=structuredClone(f.state());assert.equal((await f.call({weekId:'w',method:'MANUAL',memberId:'cm0',reason:'test'})).status,409);assert.deepEqual(f.state(),baseline);
  const result=await(await f.call()).json();assert.equal(result.handId,'h5');
});

test('audit failure, conditional races, unique conflicts and exhausted retries roll back all writes',async t=>{
  t.mock.method(console,'error',()=>{});
  for(const [flag,status] of [['auditFailure',500],['handRace',409],['weekRace',409],['unique',409]]) {
    const f=fixture();f.flags[flag]=true;const before=structuredClone(f.state());const response=await f.call();assert.equal(response.status,status);
    assert.equal(JSON.stringify(await response.json()).includes('private'),false);assert.deepEqual(f.state(),before);
  }
  const f=fixture();const before=structuredClone(f.state());f.flags.conflicts=3;assert.equal((await f.call()).status,409);assert.equal(f.flags.attempts,3);assert.deepEqual(f.state(),before);
  f.flags.conflicts=2;assert.equal((await f.call()).status,200);assert.equal(f.state().payouts.length,1);assert.equal(f.state().audits.length,1);
});
