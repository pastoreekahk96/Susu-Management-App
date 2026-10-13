import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payoutOptionsHands, createPayoutOptionsFixture, removePayoutOptionsFixture } from '../scripts/payout-options-fixture.mjs';
import { weekCompletionIds } from '../scripts/week-completion-fixture.mjs';

const ids={cycleA:'synthetic-cycle',weekA:'synthetic-week',memberA:'synthetic-member',snapshotA:'synthetic-snapshot',paymentA:'synthetic-payment'};
test('payout read fixture retains 15 frozen members and 47 individual pending hands',async()=>{
  const hands=payoutOptionsHands(ids);
  assert.equal(hands.length,47);assert.equal(new Set(hands.map(h=>h.id)).size,47);
  assert.deepEqual(hands.map(h=>h.handNumber),Array.from({length:47},(_,i)=>i+1));
  const snapshots=weekCompletionIds(ids).snapshots;
  assert.deepEqual(snapshots.map(id=>hands.filter(h=>h.cycleMemberId===id).length),[4,1,1,1,2,10,2,3,2,2,4,2,4,5,4]);
  assert.ok(hands.every(h=>h.status==='PENDING'&&h.cycleId===ids.cycleA));
  let created=false;
  await createPayoutOptionsFixture({
    week:{update:async args=>assert.deepEqual(args,{where:{id:ids.weekA},data:{status:'ELIGIBLE'}})},
    cycleHand:{createMany:async args=>{assert.deepEqual(args.data,hands);created=true;}},
  },ids);
  assert.equal(created,true);
});
test('payout fixture cleanup preserves foreign hands and hands referenced by a payout',async()=>{
  const hands=payoutOptionsHands(ids);
  let rows=[...hands.map(h=>({...h,payout:null})),{...hands[0],id:'foreign-hand',payout:null},
    {...hands[1],id: hands[1].id,cycleId:'foreign-cycle',payout:null},
    {...hands[2],id: hands[2].id,cycleMemberId:'foreign-snapshot',payout:null},
    {...hands[3],id:hands[3].id,payout:'existing-payout'}];
  await removePayoutOptionsFixture({cycleHand:{deleteMany:async({where})=>{
    rows=rows.filter(h=>!(where.id.in.includes(h.id)&&h.cycleId===where.cycleId&&where.cycleMemberId.in.includes(h.cycleMemberId)&&h.payout===where.payout));
  }}},ids);
  assert.equal(rows.length,4);
  assert.ok(rows.some(h=>h.payout==='existing-payout'));
});
