import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPayoutHistoryFixture,removePayoutHistoryFixture,payoutHistoryIds} from '../scripts/payout-history-fixture.mjs';
test('history fixture distinguishes drawn and collected synthetic records and cleans exact scoped IDs',async()=>{
 const ids={cycleA:'ca',cycleB:'cb',weekA:'wa',weekB:'wb',memberA:'ma',snapshotA:'sa',snapshotB:'sb',user:'u'};
 const calls=[];const tx=Object.fromEntries(['cycleHand','week','payout'].map(model=>[model,Object.fromEntries(['create','createMany','updateMany','deleteMany'].map(method=>[method,async args=>{calls.push({model,method,args});}]))]));
 await createPayoutHistoryFixture(tx,ids);const rows=calls.find(c=>c.model==='payout').args.data;
 assert.deepEqual(rows.map(r=>r.status),['DRAWN','COLLECTED','DRAWN']);assert.equal(rows[0].collectedAt,null);assert.ok(rows[1].collectedAt instanceof Date);assert.equal(rows[0].amount,16450);assert.equal(rows[2].handId,payoutHistoryIds(ids).foreignHand);
 calls.length=0;await removePayoutHistoryFixture(tx,ids);
 assert.deepEqual(calls[0].args.where.id.in,payoutHistoryIds(ids).payouts);assert.equal(calls[0].args.where.recordedById,'u');assert.equal(calls[1].args.where.cycleId,'cb');assert.equal(calls[1].args.where.payout,null);
});
