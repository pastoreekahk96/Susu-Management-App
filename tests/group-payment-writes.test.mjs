import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGroupPaymentWriter } from '../lib/group-payment-writes.ts';

function fixture() {
  let state = { payment: { id:'p', weekId:'w', cycleMemberId:'cm', expectedAmount:100, paidAmount:20, status:'PARTIAL', paidAt:null,
    week:{ cycleId:'c', status:'OPEN', cycle:{ status:'ACTIVE' } }, cycleMember:{ cycleId:'c' } }, audits:[] };
  const controls = { access:'OPERATOR', session:true, membership:true, auditFailure:false, conflicts:0, attempts:0, missing:false };
  const db = { $transaction: async (run,options) => {
    assert.equal(options.isolationLevel,'Serializable'); controls.attempts++;
    const draft = structuredClone(state);
    const result = await run({
      session:{ findFirst: async ({where}) => { assert.equal(where.tokenHash,'hash'); assert.equal(where.userId,'actor'); assert.ok(where.expiresAt.gt instanceof Date); return controls.session ? {id:'s'} : null; } },
      groupMembership:{ findFirst: async ({where}) => { assert.deepEqual(where,{userId:'actor',groupId:'ga',role:{in:['OWNER','ADMIN','OPERATOR']}}); return controls.membership ? {id:'gm'} : null; } },
      dailyPayment:{ findFirst:async ({where}) => { assert.deepEqual(where,{id:'p',week:{cycle:{groupId:'ga'}},cycleMember:{cycle:{groupId:'ga'}}}); return controls.missing ? null : structuredClone(draft.payment); },
        update:async ({data}) => { Object.assign(draft.payment,data); return draft.payment; } },
      auditLog:{ create:async ({data}) => { if(controls.auditFailure) throw Error('private details'); draft.audits.push(data); } },
    });
    if(controls.conflicts-- > 0) throw Object.assign(Error('conflict'),{code:'P2034'});
    state=draft; return result;
  } };
  const handler=createGroupPaymentWriter(db,async (groupId,role) => {
    assert.equal(role,'OPERATOR');
    if(controls.access==='ANONYMOUS') throw Error('AUTH_REQUIRED');
    if(groupId!=='ga' || !['OPERATOR','ADMIN','OWNER'].includes(controls.access)) throw Error('FORBIDDEN');
    return {userId:'actor',groupId};
  },async () => 'hash');
  return { controls, state:()=>state, call:(body={paymentId:'p',amount:50},groupId='ga',origin='https://synthetic.invalid') => handler(new Request(`https://synthetic.invalid/api/groups/${groupId}/payments`,{
    method:'PATCH',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body),
  }),{params:Promise.resolve({groupId})}) };
}

test('partial, full and zero amounts retain paidAt semantics and atomic actor audit',async () => {
  const f=fixture();
  for(const [amount,status,role] of [[50,'PARTIAL','OPERATOR'],[100,'PAID','ADMIN'],[0,'UNPAID','OWNER']]) {
    f.controls.access=role;
    const before=f.state().payment.paidAmount;
    const response=await f.call({paymentId:'p',amount});
    assert.equal(response.status,200);
    assert.deepEqual(Object.keys(await response.json()).sort(),['id','paidAmount','paidAt','status']);
    assert.equal(f.state().payment.status,status);
    assert.equal(f.state().payment.recordedById,'actor');
    assert.equal(f.state().payment.paidAt instanceof Date,amount>0);
    const audit=f.state().audits.at(-1);
    assert.equal(audit.actorId,'actor'); assert.equal(JSON.parse(audit.beforeJson).paidAmount,before);
    assert.deepEqual(JSON.parse(audit.afterJson),{paidAmount:amount,status,groupId:'ga',cycleId:'c',weekId:'w',cycleMemberId:'cm'});
  }
});

test('invalid fields, amounts, authority, relationship and lifecycle failures leave no writes',async () => {
  const f=fixture(); const baseline=structuredClone(f.state());
  for(const amount of [-1,1.5,101,'50',null,Number.MAX_SAFE_INTEGER+1]) assert.equal((await f.call({paymentId:'p',amount})).status,400);
  for(const body of [null,[],{paymentId:'p',amount:20,actorId:'spoof'},{paymentId:'p',amount:20,groupId:'gb'},{paymentId:'',amount:20}]) assert.equal((await f.call(body)).status,400);
  assert.equal((await f.call(undefined,'ga','https://other.invalid')).status,403);
  assert.equal((await f.call(undefined,'gb')).status,403);
  for(const role of ['MEMBER','VIEWER','ANONYMOUS']) {f.controls.access=role; assert.equal((await f.call()).status,role==='ANONYMOUS'?401:403);}
  f.controls.access='OPERATOR'; f.controls.session=false; assert.equal((await f.call()).status,401);
  f.controls.session=true; f.controls.membership=false; assert.equal((await f.call()).status,403);
  f.controls.membership=true; f.controls.missing=true; assert.equal((await f.call()).status,404); f.controls.missing=false;
  assert.deepEqual(f.state(),baseline);
  f.state().payment.cycleMember.cycleId='other'; assert.equal((await f.call()).status,404); f.state().payment.cycleMember.cycleId='c';
  for(const status of ['ELIGIBLE','PAID']) {f.state().payment.week.status=status; assert.equal((await f.call()).status,409);}
  f.state().payment.week.status='OPEN'; f.state().payment.week.cycle.status='COMPLETED'; assert.equal((await f.call()).status,409);
  f.state().payment.week.cycle.status='ACTIVE'; assert.deepEqual(f.state(),baseline);
});

test('audit failure rolls back; serializable retries use fresh state and bounded conflicts return 409',async () => {
  const f=fixture(); const baseline=structuredClone(f.state());
  f.controls.auditFailure=true; const failed=await f.call(); assert.equal(failed.status,500);
  assert.equal(JSON.stringify(await failed.json()).includes('private'),false); assert.deepEqual(f.state(),baseline);
  f.controls.auditFailure=false; f.controls.conflicts=2; const attempts=f.controls.attempts;
  assert.equal((await f.call()).status,200); assert.equal(f.controls.attempts-attempts,3); assert.equal(f.state().audits.length,1);
  const after=structuredClone(f.state()); f.controls.conflicts=3;
  assert.equal((await f.call()).status,409); assert.deepEqual(f.state(),after);
});
