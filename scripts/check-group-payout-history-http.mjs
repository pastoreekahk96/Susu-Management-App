import assert from 'node:assert/strict';
import { payoutHistoryIds } from './payout-history-fixture.mjs';
export async function checkGroupPayoutHistoryHttp(base,token,ids,db) {
  const snapshot=async()=>JSON.stringify(await Promise.all(['cycle','cycleMember','cycleHand','week','dailyPayment','payout','auditLog'].map(model=>db[model].findMany({orderBy:{id:'asc'}}))));
  const baseline=await snapshot(),f=payoutHistoryIds(ids);
  const read=async(group,status,query='',authenticated=true)=>{
    const response=await fetch(`${base}/api/groups/${encodeURIComponent(group)}/payouts/history${query}`,{headers:authenticated?{Cookie:`susu_session=${token}`}:{},redirect:'manual',signal:AbortSignal.timeout(60000)});
    if(response.status!==status)throw Object.assign(new Error('PAYOUT_HISTORY_HTTP_STATUS'),{check:"payout-history-read",expectedStatus:status,actualStatus:response.status});
    assert.equal(response.headers.get('cache-control'),'private, no-store');return response.json();
  };
  await read(ids.groupA,401,'',false);
  await read(ids.groupB,403);await read(ids.missingGroup,403);
  for(const role of ['OPERATOR','ADMIN','OWNER']) {
    await db.groupMembership.update({where:{id:ids.membership},data:{role}});
    await db.user.update({where:{id:ids.user},data:{role:'VIEWER'}});
    const data=await read(ids.groupA,200);
    assert.deepEqual(data.payouts.map(p=>p.id),[f.payouts[1],f.payouts[0]]);assert.equal(data.nextCursor,null);
    for(const p of data.payouts){assert.equal(p.amount,16450);assert.equal(p.hand.cycleMember.nameSnapshot,'Synthetic frozen member 1');assert.equal(p.week.cycle.id,ids.cycleA);assert.equal(p.recordedBy.id,ids.user);assert.equal('email' in p.recordedBy,false);}
    assert.equal(data.payouts[0].status,'COLLECTED');assert.equal(data.payouts[0].collectedAt,'2025-02-03T12:00:00.000Z');
    assert.equal(data.payouts[1].status,'DRAWN');assert.equal(data.payouts[1].collectedAt,null);
  }
  assert.deepEqual((await read(ids.groupA,200,`?cursor=${encodeURIComponent(f.payouts[1])}`)).payouts.map(p=>p.id),[f.payouts[0]]);
  await read(ids.groupA,404,`?cursor=${encodeURIComponent(f.payouts[2])}`);
  await read(ids.groupA,400,'?cursor=');await read(ids.groupA,400,'?cursor=a&cursor=b');
  await db.user.update({where:{id:ids.user},data:{role:'ADMIN'}});
  const legacy=await fetch(`${base}/payouts/history`,{headers:{Cookie:`susu_session=${token}`},signal:AbortSignal.timeout(60000)});
  assert.equal(legacy.status,200);const html=await legacy.text();assert.equal(html.includes('Synthetic frozen member'),false);assert.equal(html.includes(f.payouts[0]),false);
  await db.groupMembership.update({where:{id:ids.membership},data:{groupId:ids.groupB}});
  const completed=await read(ids.groupB,200);assert.deepEqual(completed.payouts.map(p=>p.id),[f.payouts[2]]);assert.equal(completed.payouts[0].week.cycle.status,'COMPLETED');
  await read(ids.groupA,403);
  await db.groupMembership.update({where:{id:ids.membership},data:{groupId:ids.groupA,role:'MEMBER'}});await read(ids.groupA,403);
  await db.groupMembership.delete({where:{id:ids.membership}});await read(ids.groupA,403);
  await db.session.update({where:{id:ids.session},data:{expiresAt:new Date(0)}});await read(ids.groupA,401);
  assert.equal(await snapshot(),baseline);
}
