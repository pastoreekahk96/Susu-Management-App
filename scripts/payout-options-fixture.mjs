import { weekCompletionIds } from './week-completion-fixture.mjs';

export function payoutOptionsHands(ids) {
  const hands=[4,1,1,1,2,10,2,3,2,2,4,2,4,5,4];
  const snapshots=weekCompletionIds(ids).snapshots;
  let handNumber=0;
  return hands.flatMap((count,index)=>Array.from({length:count},()=>{
    handNumber++;
    return {id:`${ids.cycleA}-payout-option-hand-${handNumber}`,cycleId:ids.cycleA,cycleMemberId:snapshots[index],handNumber,status:'PENDING'};
  }));
}

export async function createPayoutOptionsFixture(tx,ids) {
  await tx.week.update({where:{id:ids.weekA},data:{status:'ELIGIBLE'}});
  await tx.cycleHand.createMany({data:payoutOptionsHands(ids)});
}

export async function removePayoutOptionsFixture(tx,ids) {
  await tx.cycleHand.deleteMany({where:{id:{in:payoutOptionsHands(ids).map(hand=>hand.id)},cycleId:ids.cycleA,
    cycleMemberId:{in:weekCompletionIds(ids).snapshots},payout:null}});
}
