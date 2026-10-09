import assert from 'node:assert/strict';

export async function checkGroupPaymentHttp(base, token, ids, db, origin) {
  const url = group => `${base}/api/groups/${encodeURIComponent(group)}/payments`;
  const snapshot = async () => JSON.stringify(await Promise.all(['dailyPayment','auditLog'].map(model => db[model].findMany({orderBy:{id:'asc'}}))));
  const call = (body, {group=ids.groupA, cookie=true, requestOrigin=origin, legacy=false}={}) => fetch(legacy ? `${base}/api/payments` : url(group),{
    method:'PATCH',headers:{origin:requestOrigin,'Content-Type':'application/json',...(cookie?{cookie:`susu_session=${token}`}:{})},body:JSON.stringify(body),
  });
  const body = amount => ({paymentId:ids.paymentA,amount});
  async function denied(name, expected, value=body(40), options) {
    const before=await snapshot(); const response=await call(value,options);
    if(response.status!==expected) throw Object.assign(Error('PAYMENT_HTTP_STATUS'),{check:name,expectedStatus:expected,actualStatus:response.status});
    assert.deepEqual(Object.keys(await response.json()),['error']);
    assert.equal(await snapshot(),before);
  }
  const otherBaseline=JSON.stringify(await db.dailyPayment.findUniqueOrThrow({where:{id:ids.paymentB}}));
  await db.user.update({where:{id:ids.user},data:{role:'VIEWER'}});
  await denied('payment-anonymous',401,body(40),{cookie:false});
  await denied('payment-cross-origin',403,body(40),{requestOrigin:'https://other.invalid'});
  for(const amount of [-1,1.5,101,'40',null]) await denied('payment-invalid-amount',400,body(amount));
  await denied('payment-actor-spoof',400,{...body(40),actorId:ids.user});
  await denied('payment-unsupported-field',400,{...body(40),groupId:ids.groupB});
  await denied('payment-cross-group-record',404,{paymentId:ids.paymentB,amount:40});
  await denied('payment-missing-record',404,{paymentId:`${ids.paymentA}-missing`,amount:40});
  await denied('payment-other-group',403,body(40),{group:ids.groupB});
  await db.dailyPayment.update({where:{id:ids.paymentA},data:{cycleMemberId:ids.snapshotB}});
  await denied('payment-mismatched-cross-group',404);
  await db.cycle.update({where:{id:ids.cycleB},data:{groupId:ids.groupA}});
  await denied('payment-mismatched-same-group',404);
  await db.cycle.update({where:{id:ids.cycleB},data:{groupId:ids.groupB}});
  await db.dailyPayment.update({where:{id:ids.paymentA},data:{cycleMemberId:ids.snapshotA}});
  for(const status of ['ELIGIBLE','PAID']) {
    await db.week.update({where:{id:ids.weekA},data:{status}}); await denied('payment-closed-week',409);
  }
  await db.week.update({where:{id:ids.weekA},data:{status:'OPEN'}});
  await db.cycle.update({where:{id:ids.cycleA},data:{status:'COMPLETED'}}); await denied('payment-inactive-cycle',409);
  await db.cycle.update({where:{id:ids.cycleA},data:{status:'ACTIVE'}});
  await db.groupMembership.update({where:{id:ids.membership},data:{role:'MEMBER'}});
  await denied('payment-member',403);
  await db.user.update({where:{id:ids.user},data:{role:'ADMIN'}}); await denied('payment-global-admin-no-bypass',403);
  await denied('payment-legacy-no-bypass',409,body(40),{legacy:true});
  await db.user.update({where:{id:ids.user},data:{role:'VIEWER'}});
  for(const [role,amount,status] of [['OPERATOR',45,'PARTIAL'],['ADMIN',100,'PAID'],['OWNER',0,'UNPAID']]) {
    await db.groupMembership.update({where:{id:ids.membership},data:{role}});
    const before=await db.dailyPayment.findUniqueOrThrow({where:{id:ids.paymentA}});
    const count=await db.auditLog.count();
    const response=await call(body(amount)); assert.equal(response.status,200);
    const result=await response.json(); assert.equal(result.paidAmount,amount); assert.equal(result.status,status);
    assert.equal(result.paidAt!==null,amount>0);
    const payment=await db.dailyPayment.findUniqueOrThrow({where:{id:ids.paymentA}});
    assert.equal(payment.recordedById,ids.user); assert.equal(payment.paidAmount,amount);
    assert.equal(await db.auditLog.count(),count+1);
    const audit=await db.auditLog.findFirstOrThrow({where:{entityId:ids.paymentA},orderBy:{createdAt:'desc'}});
    assert.equal(audit.actorId,ids.user); assert.equal(audit.action,'UPDATE_DAILY_PAYMENT');
    assert.equal(JSON.parse(audit.beforeJson).paidAmount,before.paidAmount);
    assert.equal(JSON.parse(audit.afterJson).paidAmount,amount); assert.equal(JSON.parse(audit.afterJson).groupId,ids.groupA);
  }
  const auditsBefore=await db.auditLog.count();
  const responses=await Promise.all([call(body(35)),call(body(65))]);
  for(const response of responses) assert.ok([200,409].includes(response.status));
  const successes=responses.filter(response=>response.status===200).length; assert.ok(successes>0);
  assert.equal(await db.auditLog.count(),auditsBefore+successes);
  const audits=await db.auditLog.findMany({where:{entityId:ids.paymentA}});
  const concurrent=audits.filter(row=>[35,65].includes(JSON.parse(row.afterJson).paidAmount));
  assert.equal(concurrent.length,successes);
  const first=concurrent.find(row=>JSON.parse(row.beforeJson).paidAmount===0); assert.ok(first);
  const firstAmount=JSON.parse(first.afterJson).paidAmount;
  const last=concurrent.find(row=>JSON.parse(row.beforeJson).paidAmount===firstAmount);
  if(successes===2) assert.ok(last);
  const final=await db.dailyPayment.findUniqueOrThrow({where:{id:ids.paymentA}});
  assert.equal(final.paidAmount,JSON.parse((last??first).afterJson).paidAmount);
  assert.equal(final.status,'PARTIAL');
  await db.session.update({where:{id:ids.session},data:{expiresAt:new Date(0)}}); await denied('payment-expired-session',401);
  await db.session.update({where:{id:ids.session},data:{expiresAt:new Date(Date.now()+3600000)}});
  await db.groupMembership.delete({where:{id:ids.membership}}); await denied('payment-revoked-membership',403);
  await db.groupMembership.create({data:{id:ids.membership,userId:ids.user,groupId:ids.groupA,role:'OPERATOR'}});
  await db.session.delete({where:{id:ids.session}}); await denied('payment-revoked-session',401);
  assert.equal(JSON.stringify(await db.dailyPayment.findUniqueOrThrow({where:{id:ids.paymentB}})),otherBaseline);
}
