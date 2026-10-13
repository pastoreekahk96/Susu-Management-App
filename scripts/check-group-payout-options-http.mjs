import assert from 'node:assert/strict';
import { weekCompletionIds } from './week-completion-fixture.mjs';

export async function checkGroupPayoutOptionsHttp(base,token,ids,db,origin) {
  const financial=async()=>JSON.stringify(await Promise.all(['cycle','cycleMember','cycleHand','week','dailyPayment','payout','auditLog']
    .map(model=>db[model].findMany({orderBy:{id:'asc'}}))));
  const baseline=await financial();
  const read=async(groupId,expected,check,authenticated=true)=>{
    const response=await fetch(`${base}/api/groups/${encodeURIComponent(groupId)}/payouts/options`,{
      headers:authenticated?{Cookie:`susu_session=${token}`}:{},redirect:'manual',signal:AbortSignal.timeout(60000),
    });
    if(response.status!==expected) {
      const error=new Error('PAYOUT_OPTIONS_HTTP_STATUS');
      Object.assign(error,{check,expectedStatus:expected,actualStatus:response.status});throw error;
    }
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    return response.json();
  };
  await read(ids.groupA,401,'payout-options-anonymous',false);
  await read(ids.groupA,403,'payout-options-operator');
  await read(ids.groupB,403,'payout-options-other-group');
  await read(ids.missingGroup,403,'payout-options-missing-group');
  const week=await db.week.findUniqueOrThrow({where:{id:ids.weekA}});
  const expectedMembers=weekCompletionIds(ids).snapshots.map((id,index)=>({id,name:`Synthetic frozen member ${index+1}`,
    pendingHands:[4,1,1,1,2,10,2,3,2,2,4,2,4,5,4][index]})).sort((a,b)=>a.name.localeCompare(b.name));
  const expected={weeks:[{id:ids.weekA,weekNumber:1,startDate:week.startDate.toISOString().slice(0,10),
    endDate:week.endDate.toISOString().slice(0,10),amount:16450}],members:expectedMembers};
  for(const role of ['ADMIN','OWNER']) {
    await db.groupMembership.update({where:{id:ids.membership},data:{role}});
    await db.user.update({where:{id:ids.user},data:{role:'VIEWER'}});
    assert.deepEqual(await read(ids.groupA,200,`payout-options-${role.toLowerCase()}`),expected);
  }
  await db.user.update({where:{id:ids.user},data:{role:'ADMIN'}});
  const legacy=await fetch(`${base}/api/payouts`,{headers:{Cookie:`susu_session=${token}`},signal:AbortSignal.timeout(60000)});
  assert.equal(legacy.status,200);assert.deepEqual(await legacy.json(),{weeks:[],members:[]});
  const legacyWrite=await fetch(`${base}/api/payouts`,{method:'POST',headers:{Cookie:`susu_session=${token}`,Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({weekId:ids.weekA,method:'RANDOM'}),signal:AbortSignal.timeout(60000)});
  assert.equal(legacyWrite.status,409);
  await db.groupMembership.update({where:{id:ids.membership},data:{groupId:ids.groupB,role:'ADMIN'}});
  assert.deepEqual(await read(ids.groupB,200,'payout-options-no-active-cycle'),{weeks:[],members:[]});
  await read(ids.groupA,403,'payout-options-revoked-group');
  await db.groupMembership.update({where:{id:ids.membership},data:{groupId:ids.groupA,role:'MEMBER'}});
  await read(ids.groupA,403,'payout-options-global-admin-no-bypass');
  await db.groupMembership.delete({where:{id:ids.membership}});
  await read(ids.groupA,403,'payout-options-revoked');
  await db.session.update({where:{id:ids.session},data:{expiresAt:new Date(0)}});
  await read(ids.groupA,401,'payout-options-expired');
  assert.equal(await financial(),baseline);
}
