import assert from 'node:assert/strict';
import { weekCompletionIds } from './week-completion-fixture.mjs';
import { payoutOptionsHands } from './payout-options-fixture.mjs';

export async function checkGroupPayoutSelectionHttp(base,token,ids,db,origin) {
  const f=weekCompletionIds(ids);
  const body={weekId:ids.weekA,method:'RANDOM'};
  const snapshot=async()=>JSON.stringify(await Promise.all(['cycle','cycleMember','cycleHand','week','dailyPayment','payout','auditLog'].map(model=>db[model].findMany({orderBy:{id:'asc'}}))));
  const call=(value=body,{group=ids.groupA,cookie=true,requestOrigin=origin,legacy=false}={})=>fetch(legacy?`${base}/api/payouts`:`${base}/api/groups/${encodeURIComponent(group)}/payouts`,{
    method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:`susu_session=${token}`}:{})},body:JSON.stringify(value),signal:AbortSignal.timeout(60000),
  });
  const denied=async(check,status,value=body,options)=>{
    const before=await snapshot();const response=await call(value,options);
    if(response.status!==status)throw Object.assign(Error('PAYOUT_SELECTION_HTTP_STATUS'),{check,expectedStatus:status,actualStatus:response.status});
    assert.deepEqual(Object.keys(await response.json()),['error']);assert.equal(await snapshot(),before);
  };
  await db.user.update({where:{id:ids.user},data:{role:'VIEWER'}});
  await denied('payout-anonymous',401,body,{cookie:false});await denied('payout-operator',403);
  await db.user.update({where:{id:ids.user},data:{role:'ADMIN'}});
  await db.groupMembership.update({where:{id:ids.membership},data:{role:'MEMBER'}});
  await denied('payout-global-admin-no-bypass',403);await denied('payout-legacy-no-bypass',409,body,{legacy:true});
  await db.user.update({where:{id:ids.user},data:{role:'VIEWER'}});
  await db.groupMembership.update({where:{id:ids.membership},data:{role:'ADMIN'}});
  await denied('payout-cross-origin',403,body,{requestOrigin:'https://other.invalid'});
  for(const value of [null,[],{}, {...body,actorId:ids.user},{...body,amount:16450},{...body,groupId:ids.groupB},{...body,memberId:''},
    {weekId:ids.weekA,method:'MANUAL',memberId:f.snapshots[5],reason:' '},{weekId:ids.weekA,method:'MANUAL',memberId:f.snapshots[5],reason:'x'.repeat(501)}])await denied('payout-invalid-fields',400,value);
  await denied('payout-other-group',403,body,{group:ids.groupB});await denied('payout-cross-group-week',404,{...body,weekId:ids.weekB});
  await denied('payout-missing-week',404,{...body,weekId:`${ids.weekA}-missing`});
  await denied('payout-cross-group-member',404,{weekId:ids.weekA,method:'MANUAL',memberId:ids.snapshotB,reason:'Synthetic reason'});
  await db.week.update({where:{id:ids.weekA},data:{status:'OPEN'}});await denied('payout-open-week',409);
  await db.week.update({where:{id:ids.weekA},data:{status:'ELIGIBLE'}});
  const initialEnd=(await db.week.findUniqueOrThrow({where:{id:ids.weekA}})).endDate;
  const future=new Date();future.setUTCDate(future.getUTCDate()+7);await db.week.update({where:{id:ids.weekA},data:{endDate:future}});await denied('payout-too-early',409);
  await db.week.update({where:{id:ids.weekA},data:{endDate:initialEnd}});
  await db.cycle.update({where:{id:ids.cycleA},data:{status:'COMPLETED'}});await denied('payout-inactive-cycle',409);
  await db.cycle.update({where:{id:ids.cycleA},data:{status:'ACTIVE'}});
  await db.dailyPayment.update({where:{id:ids.paymentA},data:{paidAmount:20,status:'PARTIAL'}});await denied('payout-partial',409);
  await db.dailyPayment.update({where:{id:ids.paymentA},data:{paidAmount:200,status:'PAID'}});
  const first=payoutOptionsHands(ids)[0];
  await db.cycleHand.update({where:{id:first.id},data:{cycleMemberId:ids.snapshotB}});await denied('payout-foreign-hand-link',409);
  await db.cycleHand.update({where:{id:first.id},data:{cycleMemberId:ids.snapshotA}});
  await db.cycleHand.delete({where:{id:first.id}});await denied('payout-missing-hand',409);await db.cycleHand.create({data:first});
  await db.session.update({where:{id:ids.session},data:{expiresAt:new Date(0)}});await denied('payout-expired-session',401);
  await db.session.update({where:{id:ids.session},data:{expiresAt:new Date(Date.now()+3600000)}});
  await db.groupMembership.delete({where:{id:ids.membership}});await denied('payout-revoked-membership',403);
  await db.groupMembership.create({data:{id:ids.membership,userId:ids.user,groupId:ids.groupA,role:'ADMIN'}});
  const payments=JSON.stringify(await db.dailyPayment.findMany({orderBy:{id:'asc'}}));
  const other=JSON.stringify(await db.week.findUniqueOrThrow({where:{id:ids.weekB}}));
  const manual=await call({weekId:ids.weekA,method:'MANUAL',memberId:f.snapshots[5],reason:' Synthetic emergency '});assert.equal(manual.status,200);
  const selected=await manual.json();assert.equal(selected.amount,16450);assert.equal(selected.manualReason,'Synthetic emergency');assert.equal(selected.status,'DRAWN');
  assert.equal(selected.memberName,'Synthetic frozen member 6');assert.equal(await db.cycleHand.count({where:{cycleMemberId:f.snapshots[5],status:'PENDING'}}),9);
  await denied('payout-repeat-week',409);
  await db.groupMembership.update({where:{id:ids.membership},data:{role:'OWNER'}});
  const responses=await Promise.all([call({weekId:f.futureWeek,method:'RANDOM'}),call({weekId:f.futureWeek,method:'RANDOM'})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const random=await responses.find(r=>r.status===200).json();assert.notEqual(random.handId,selected.handId);assert.equal(random.amount,16450);assert.equal(random.selectionMethod,'RANDOM');
  const payouts=await db.payout.findMany({orderBy:{weekId:'asc'}});assert.equal(payouts.length,2);
  assert.equal(await db.cycleHand.count({where:{cycleId:ids.cycleA,status:'SELECTED'}}),2);assert.equal(await db.cycleHand.count({where:{cycleId:ids.cycleA,status:'PENDING'}}),45);
  for(const payout of payouts) {
    assert.equal(payout.recordedById,ids.user);assert.equal(payout.status,'DRAWN');assert.equal(payout.collectedAt,null);
    assert.equal((await db.week.findUniqueOrThrow({where:{id:payout.weekId}})).status,'PAID');
    const audits=await db.auditLog.findMany({where:{entityType:'Payout',entityId:payout.id}});assert.equal(audits.length,1);assert.equal(audits[0].actorId,ids.user);
    assert.equal(audits[0].action,payout.selectionMethod==='RANDOM'?'RANDOM_PAYOUT':'MANUAL_PAYOUT');
    const after=JSON.parse(audits[0].afterJson);assert.equal(after.groupId,ids.groupA);assert.equal(after.cycleId,ids.cycleA);assert.equal(after.handId,payout.handId);assert.equal(after.amount,16450);
  }
  assert.equal(JSON.stringify(await db.dailyPayment.findMany({orderBy:{id:'asc'}})),payments);assert.equal(JSON.stringify(await db.week.findUniqueOrThrow({where:{id:ids.weekB}})),other);
  await db.session.delete({where:{id:ids.session}});await denied('payout-revoked-session',401,{weekId:f.futureWeek,method:'RANDOM'});
}
