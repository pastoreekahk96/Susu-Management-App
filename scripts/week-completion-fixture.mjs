const hands=[4,1,1,1,2,10,2,3,2,2,4,2,4,5,4];
export function weekCompletionIds(ids) {
  const members=hands.map((_,i)=>i===0?ids.memberA:`${ids.cycleA}-member-${i}`);
  const snapshots=hands.map((_,i)=>i===0?ids.snapshotA:`${ids.cycleA}-snapshot-${i}`);
  const payments=hands.flatMap((_,i)=>Array.from({length:7},(_,d)=>i===0&&d===0?ids.paymentA:`${ids.weekA}-payment-${i}-${d}`));
  return {members,snapshots,payments,futureWeek:`${ids.weekA}-future`,paymentsB:Array.from({length:7},(_,d)=>d===0?ids.paymentB:`${ids.weekB}-payment-${d}`)};
}
export async function createWeekCompletionFixture(tx,ids) {
  const fixture=weekCompletionIds(ids);
  const now=new Date();const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7-7);
  const end=new Date(start);end.setUTCDate(end.getUTCDate()+6);
  const future=new Date(start);future.setUTCDate(future.getUTCDate()+14);
  const futureEnd=new Date(future);futureEnd.setUTCDate(futureEnd.getUTCDate()+6);
  await tx.cycle.update({where:{id:ids.cycleA},data:{status:'ACTIVE',startDate:start}});
  await tx.member.createMany({data:fixture.members.slice(1).map((id,i)=>({id,name:`${ids.cycleA} synthetic ${i+1}`,groupId:ids.groupA}))});
  await tx.cycleMember.createMany({data:hands.map((handsCount,i)=>({id:fixture.snapshots[i],cycleId:ids.cycleA,memberId:fixture.members[i],nameSnapshot:`Synthetic frozen member ${i+1}`,handsCount}))});
  await tx.cycleMember.create({data:{id:ids.snapshotB,cycleId:ids.cycleB,memberId:ids.memberB,nameSnapshot:'Synthetic frozen B',handsCount:1}});
  await tx.week.createMany({data:[
    {id:ids.weekA,cycleId:ids.cycleA,weekNumber:1,startDate:start,endDate:end},
    {id:ids.weekB,cycleId:ids.cycleB,weekNumber:1,startDate:start,endDate:end},
    {id:fixture.futureWeek,cycleId:ids.cycleA,weekNumber:3,startDate:future,endDate:futureEnd},
  ]});
  await tx.dailyPayment.createMany({data:hands.flatMap((handCount,i)=>Array.from({length:7},(_,dayIndex)=>{
    const paymentDate=new Date(start);paymentDate.setUTCDate(paymentDate.getUTCDate()+dayIndex);
    return{id:fixture.payments[i*7+dayIndex],weekId:ids.weekA,cycleMemberId:fixture.snapshots[i],paymentDate,dayIndex,expectedAmount:handCount*50,paidAmount:handCount*50,status:'PAID'};
  }))});
  await tx.dailyPayment.createMany({data:fixture.paymentsB.map((id,dayIndex)=>{const paymentDate=new Date(start);paymentDate.setUTCDate(paymentDate.getUTCDate()+dayIndex);return{id,weekId:ids.weekB,cycleMemberId:ids.snapshotB,paymentDate,dayIndex,expectedAmount:50,paidAmount:50,status:'PAID'};})});
}
export async function removeWeekCompletionFixture(tx,ids) {
  const f=weekCompletionIds(ids);
  await tx.auditLog.deleteMany({where:{actorId:ids.user,action:'COMPLETE_WEEK',entityType:'Week',entityId:{in:[ids.weekA,f.futureWeek]}}});
  await tx.dailyPayment.deleteMany({where:{id:{in:f.payments},weekId:ids.weekA,cycleMemberId:{in:f.snapshots}}});
  await tx.dailyPayment.deleteMany({where:{id:{in:f.paymentsB},weekId:ids.weekB,cycleMemberId:ids.snapshotB}});
  await tx.cycleMember.deleteMany({where:{id:{in:f.snapshots},cycleId:ids.cycleA,memberId:{in:f.members},payments:{none:{}},hands:{none:{}}}});
  await tx.cycleMember.deleteMany({where:{id:ids.snapshotB,cycleId:ids.cycleB,memberId:ids.memberB,payments:{none:{}},hands:{none:{}}}});
  await tx.week.deleteMany({where:{id:{in:[ids.weekA,f.futureWeek]},cycleId:ids.cycleA,payments:{none:{}},payout:null}});
  await tx.week.deleteMany({where:{id:ids.weekB,cycleId:ids.cycleB,payments:{none:{}},payout:null}});
  await tx.member.deleteMany({where:{id:{in:f.members.slice(1)},groupId:ids.groupA,cycleMembers:{none:{}}}});
  await tx.cycle.update({where:{id:ids.cycleA},data:{status:'COMPLETED'}});
}
