import { weekCompletionIds } from './week-completion-fixture.mjs';
import { payoutOptionsHands } from './payout-options-fixture.mjs';

export function payoutSelectionPaymentIds(ids) {
  const f=weekCompletionIds(ids);
  return f.snapshots.flatMap((_,i)=>Array.from({length:7},(_,day)=>`${f.futureWeek}-payout-payment-${i}-${day}`));
}
export async function createPayoutSelectionFixture(tx,ids) {
  const f=weekCompletionIds(ids);
  const week=await tx.week.findUniqueOrThrow({where:{id:ids.weekA}});
  const start=new Date(week.startDate);start.setUTCDate(start.getUTCDate()-7);
  const end=new Date(week.endDate);end.setUTCDate(end.getUTCDate()-7);
  await tx.cycle.update({where:{id:ids.cycleA},data:{startDate:start}});
  await tx.week.update({where:{id:ids.weekA},data:{startDate:start,endDate:end}});
  await tx.week.update({where:{id:f.futureWeek},data:{weekNumber:2,startDate:week.startDate,endDate:week.endDate,status:'ELIGIBLE'}});
  const payments=await tx.dailyPayment.findMany({where:{weekId:ids.weekA},orderBy:[{cycleMemberId:'asc'},{dayIndex:'asc'}]});
  for(let dayIndex=0;dayIndex<7;dayIndex++) {
    const paymentDate=new Date(start);paymentDate.setUTCDate(paymentDate.getUTCDate()+dayIndex);
    await tx.dailyPayment.updateMany({where:{weekId:ids.weekA,dayIndex},data:{paymentDate}});
  }
  const extraIds=payoutSelectionPaymentIds(ids);
  await tx.dailyPayment.createMany({data:payments.map(payment=>{
    const index=f.snapshots.indexOf(payment.cycleMemberId)*7+payment.dayIndex;
    return{id:extraIds[index],weekId:f.futureWeek,cycleMemberId:payment.cycleMemberId,paymentDate:payment.paymentDate,
      dayIndex:payment.dayIndex,expectedAmount:payment.expectedAmount,paidAmount:payment.paidAmount,status:'PAID'};
  })});
}
export async function removePayoutSelectionFixture(tx,ids) {
  const f=weekCompletionIds(ids);
  const scope={weekId:{in:[ids.weekA,f.futureWeek]},handId:{in:payoutOptionsHands(ids).map(hand=>hand.id)},recordedById:ids.user};
  const payouts=await tx.payout.findMany({where:scope,select:{id:true}});
  await tx.auditLog.deleteMany({where:{actorId:ids.user,entityType:'Payout',entityId:{in:payouts.map(p=>p.id)},action:{in:['RANDOM_PAYOUT','MANUAL_PAYOUT']}}});
  await tx.payout.deleteMany({where:{...scope,id:{in:payouts.map(p=>p.id)}}});
  await tx.dailyPayment.deleteMany({where:{id:{in:payoutSelectionPaymentIds(ids)},weekId:f.futureWeek,cycleMemberId:{in:f.snapshots}}});
}
