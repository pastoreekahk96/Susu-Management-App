import { payoutOptionsHands } from './payout-options-fixture.mjs';
import { weekCompletionIds } from './week-completion-fixture.mjs';
export function payoutHistoryIds(ids) {
  return {payouts:[`${ids.weekA}-history-drawn`,`${ids.weekA}-history-collected`,`${ids.weekB}-history-foreign`],foreignHand:`${ids.cycleB}-history-hand`};
}
export async function createPayoutHistoryFixture(tx,ids) {
  const f=payoutHistoryIds(ids),hands=payoutOptionsHands(ids);
  await tx.cycleHand.create({data:{id:f.foreignHand,cycleId:ids.cycleB,cycleMemberId:ids.snapshotB,handNumber:1,status:'SELECTED'}});
  const weeks=[ids.weekA,weekCompletionIds(ids).futureWeek,ids.weekB];
  await tx.week.updateMany({where:{id:{in:weeks}},data:{status:'PAID'}});
  await tx.cycleHand.updateMany({where:{id:{in:hands.slice(0,2).map(h=>h.id)},cycleId:ids.cycleA},data:{status:'SELECTED'}});
  await tx.payout.createMany({data:f.payouts.map((id,i)=>({id,weekId:weeks[i],handId:i===2?f.foreignHand:hands[i].id,
    amount:i===2?350:16450,selectionMethod:i===1?'MANUAL':'RANDOM',manualReason:i===1?'Synthetic history reason':null,
    status:i===1?'COLLECTED':'DRAWN',drawnAt:new Date(`2025-02-0${i+1}T12:00:00Z`),
    collectedAt:i===1?new Date('2025-02-03T12:00:00Z'):null,recordedById:ids.user}))});
}
export async function removePayoutHistoryFixture(tx,ids) {
  const f=payoutHistoryIds(ids);
  await tx.payout.deleteMany({where:{id:{in:f.payouts},recordedById:ids.user,weekId:{in:[ids.weekA,weekCompletionIds(ids).futureWeek,ids.weekB]}}});
  await tx.cycleHand.deleteMany({where:{id:f.foreignHand,cycleId:ids.cycleB,cycleMemberId:ids.snapshotB,payout:null}});
}
