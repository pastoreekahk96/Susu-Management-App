import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPayoutSelectionFixture, removePayoutSelectionFixture, payoutSelectionPaymentIds } from '../scripts/payout-selection-fixture.mjs';
import { weekCompletionIds } from '../scripts/week-completion-fixture.mjs';
import { payoutOptionsHands } from '../scripts/payout-options-fixture.mjs';
const ids={cycleA:'synthetic-cycle',weekA:'synthetic-week',memberA:'synthetic-member',snapshotA:'synthetic-snapshot',paymentA:'synthetic-payment',user:'synthetic-user'};

test('selection fixture makes two sequential finished eligible weeks with 105 complete records each',async()=>{
  const f=weekCompletionIds(ids),counts=[4,1,1,1,2,10,2,3,2,2,4,2,4,5,4];
  const weeks={[ids.weekA]:{startDate:new Date('2026-10-05'),endDate:new Date('2026-10-11'),status:'ELIGIBLE',weekNumber:1},[f.futureWeek]:{}};
  const payments=f.snapshots.flatMap((cycleMemberId,i)=>Array.from({length:7},(_,dayIndex)=>({cycleMemberId,dayIndex,expectedAmount:counts[i]*50,paidAmount:counts[i]*50,status:'PAID',paymentDate:new Date(Date.UTC(2026,9,5+dayIndex))})));
  let extra=[],start;
  await createPayoutSelectionFixture({
    cycle:{update:async({data})=>{start=data.startDate;}},
    week:{findUniqueOrThrow:async()=>structuredClone(weeks[ids.weekA]),update:async({where,data})=>Object.assign(weeks[where.id],data)},
    dailyPayment:{findMany:async()=>structuredClone(payments),updateMany:async({where,data})=>{for(const payment of payments.filter(p=>p.dayIndex===where.dayIndex))Object.assign(payment,data);},createMany:async({data})=>{extra=data;}},
  },ids);
  assert.equal(start.toISOString().slice(0,10),'2026-09-28');
  assert.equal(weeks[ids.weekA].endDate.toISOString().slice(0,10),'2026-10-04');
  assert.equal(weeks[f.futureWeek].startDate.toISOString().slice(0,10),'2026-10-05');assert.equal(weeks[f.futureWeek].weekNumber,2);
  assert.equal(weeks[f.futureWeek].status,'ELIGIBLE');assert.equal(extra.length,105);assert.equal(new Set(extra.map(p=>p.id)).size,105);
  assert.equal(extra.reduce((sum,p)=>sum+p.paidAmount,0),16450);
  assert.ok(extra.every(p=>p.weekId===f.futureWeek&&p.paymentDate.getUTCDate()===5+p.dayIndex));
  assert.ok(payments.every(p=>p.paymentDate.getTime()===start.getTime()+p.dayIndex*86400000));
});

test('selection cleanup removes only payouts, audits and payments belonging to exact synthetic parents',async()=>{
  const f=weekCompletionIds(ids);const hand=payoutOptionsHands(ids)[0];
  let payouts=[{id:'synthetic-payout',weekId:ids.weekA,handId:hand.id,recordedById:ids.user},
    {id:'other-actor',weekId:ids.weekA,handId:hand.id,recordedById:'other'},
    {id:'other-week',weekId:'other',handId:hand.id,recordedById:ids.user}];
  let audits=[{entityId:'synthetic-payout',actorId:ids.user,entityType:'Payout',action:'MANUAL_PAYOUT'},
    {entityId:'synthetic-payout',actorId:'other',entityType:'Payout',action:'MANUAL_PAYOUT'}];
  let payments=[{id:payoutSelectionPaymentIds(ids)[0],weekId:f.futureWeek,cycleMemberId:ids.snapshotA},
    {id:'foreign',weekId:f.futureWeek,cycleMemberId:ids.snapshotA}];
  const match=(p,where)=>where.weekId.in.includes(p.weekId)&&where.handId.in.includes(p.handId)&&where.recordedById===p.recordedById;
  await removePayoutSelectionFixture({
    payout:{findMany:async({where})=>payouts.filter(p=>match(p,where)),deleteMany:async({where})=>{payouts=payouts.filter(p=>!(match(p,where)&&where.id.in.includes(p.id)));}},
    auditLog:{deleteMany:async({where})=>{audits=audits.filter(a=>!(a.actorId===where.actorId&&a.entityType===where.entityType&&where.entityId.in.includes(a.entityId)&&where.action.in.includes(a.action)));}},
    dailyPayment:{deleteMany:async({where})=>{payments=payments.filter(p=>!(where.id.in.includes(p.id)&&where.weekId===p.weekId&&where.cycleMemberId.in.includes(p.cycleMemberId)));}},
  },ids);
  assert.deepEqual(payouts.map(p=>p.id),['other-actor','other-week']);assert.equal(audits.length,1);assert.equal(audits[0].actorId,'other');assert.deepEqual(payments.map(p=>p.id),['foreign']);
});
