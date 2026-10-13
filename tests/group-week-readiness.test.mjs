import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupWeekReadiness } from '../lib/group-week-readiness.ts';
const full=()=>[{payments:Array.from({length:7},(_,dayIndex)=>({dayIndex,expectedAmount:200,paidAmount:200,status:'PAID'}))}];
const check=members=>groupWeekReadiness(members,7,'2026-10-11',new Date('2026-10-12T00:00:00Z'));
test('completion display preserves Sunday boundary and complete saved day slots',()=>{
  assert.equal(check(full()),null);
  assert.ok(groupWeekReadiness(full(),7,'2026-10-11',new Date('2026-10-11T23:59:59.999Z')));
  assert.ok(check([]));const missing=full();missing[0].payments.pop();assert.ok(check(missing));
  for(const change of [{paidAmount:20},{status:'PARTIAL'},{expectedAmount:0},{expectedAmount:1.5},{dayIndex:7}]){
    const members=full();Object.assign(members[0].payments[0],change);assert.ok(check(members));
  }
  const duplicate=full();duplicate[0].payments[0].dayIndex=1;assert.ok(check(duplicate));
  assert.ok(groupWeekReadiness(full(),0,'2026-10-11',new Date('2026-10-12')));
});
