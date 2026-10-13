import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createWeekCompletionFixture,removeWeekCompletionFixture,weekCompletionIds} from '../scripts/week-completion-fixture.mjs';
const ids={cycleA:'synthetic-ca',cycleB:'synthetic-cb',weekA:'synthetic-wa',weekB:'synthetic-wb',memberA:'synthetic-ma',memberB:'synthetic-mb',snapshotA:'synthetic-sa',snapshotB:'synthetic-sb',paymentA:'synthetic-pa',paymentB:'synthetic-pb',groupA:'synthetic-ga',groupB:'synthetic-gb',user:'synthetic-user'};

test('completion fixture represents 15 members, 47 hands, 105 complete daily records and 16450 LD',async()=>{
  const captured={};
  const tx=Object.fromEntries(['cycle','member','cycleMember','week','dailyPayment'].map(model=>[model,Object.fromEntries(['update','create','createMany'].map(method=>[method,async args=>{(captured[`${model}.${method}`]??=[]).push(args);}]))]));
  await createWeekCompletionFixture(tx,ids);
  const members=captured['cycleMember.createMany'][0].data;assert.equal(members.length,15);assert.equal(members.reduce((s,m)=>s+m.handsCount,0),47);
  const payments=captured['dailyPayment.createMany'][0].data;assert.equal(payments.length,105);assert.equal(payments.reduce((s,p)=>s+p.paidAmount,0),16450);
  const week=captured['week.createMany'][0].data.find(w=>w.id===ids.weekA);assert.equal(week.startDate.getUTCDay(),1);assert.equal(week.endDate.getUTCDay(),0);assert.ok(week.endDate<new Date());
  for(const member of members) {
    const rows=payments.filter(p=>p.cycleMemberId===member.id);assert.equal(rows.length,7);assert.deepEqual(rows.map(r=>r.dayIndex),[0,1,2,3,4,5,6]);
    for(const row of rows){assert.equal(row.weekId,ids.weekA);assert.equal(row.status,'PAID');assert.equal(row.paidAmount,member.handsCount*50);assert.equal(row.expectedAmount,row.paidAmount);assert.equal(row.paymentDate.getTime(),week.startDate.getTime()+row.dayIndex*86400000);}
  }
});

test('fixture cleanup restricts deletes to exact synthetic IDs, actors and parent relationships',async()=>{
  const calls=[];const tx=Object.fromEntries(['auditLog','dailyPayment','cycleMember','week','member','cycle'].map(model=>[model,{deleteMany:async args=>calls.push({model,...args}),update:async()=>{}}]));
  await removeWeekCompletionFixture(tx,ids);const f=weekCompletionIds(ids);
  const payment=calls.find(c=>c.model==='dailyPayment');assert.deepEqual(payment.where,{id:{in:f.payments},weekId:ids.weekA,cycleMemberId:{in:f.snapshots}});
  const audit=calls.find(c=>c.model==='auditLog');assert.equal(audit.where.actorId,ids.user);assert.equal(audit.where.action,'COMPLETE_WEEK');assert.equal(audit.where.entityType,'Week');
  const extraMembers=calls.find(c=>c.model==='member');assert.equal(extraMembers.where.groupId,ids.groupA);assert.equal(extraMembers.where.id.in.includes(ids.memberA),false);assert.deepEqual(extraMembers.where.cycleMembers,{none:{}});
  assert.equal(calls.some(c=>Object.keys(c.where).length===0),false);
});
