import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GroupPayoutPanel from '../app/payouts/group-payout-panel.tsx';
import { groupPayoutConfirmation, isConfirmedGroupPayout } from '../lib/group-payout-ui.ts';
// tsx respects this repo's preserved JSX; provide React for its test transform.
globalThis.React=React;
const Panel=typeof GroupPayoutPanel==='function'?GroupPayoutPanel:GroupPayoutPanel.default;
const week={id:'w',weekNumber:1,startDate:'2026-10-05',endDate:'2026-10-11',amount:16450};
const members=[{id:'m',name:'Frozen member',pendingHands:10},{id:'depleted',name:'Depleted member',pendingHands:0}];
const result={id:'p',weekId:'w',weekNumber:1,handId:'h',handNumber:1,memberName:'Frozen member',amount:16450,
  selectionMethod:'MANUAL',manualReason:'Emergency',status:'DRAWN',drawnAt:'2026-10-12T00:00:00Z'};

test('confirmation describes one hand, amount and separate cash collection with actual line breaks',()=>{
  const manual=groupPayoutConfirmation(week,'MANUAL',members[0],' Emergency ');
  assert.match(manual,/Member: Frozen member\nReason: Emergency/);
  assert.match(manual,/Exactly one remaining hand/);assert.match(manual,/16,450 LD/);assert.match(manual,/Cash collection is confirmed separately/);
  assert.doesNotMatch(groupPayoutConfirmation(week,'RANDOM',undefined,''),/Member:/);
});
test('success is accepted only when it matches the submitted week, amount, method, frozen member and reason',()=>{
  assert.equal(isConfirmedGroupPayout(result,week,'MANUAL',members,'m',' Emergency '),true);
  for(const patch of [{weekId:'foreign'},{weekNumber:2},{amount:1},{selectionMethod:'RANDOM'},{memberName:'Other'},{manualReason:'Other'},{status:'COLLECTED'},
    {handNumber:0},{handNumber:1.5},{handId:''},{id:''},{drawnAt:'invalid'}])assert.equal(isConfirmedGroupPayout({...result,...patch},week,'MANUAL',members,'m','Emergency'),false);
  assert.equal(isConfirmedGroupPayout(result,week,'MANUAL',members,'depleted','Emergency'),false);
  assert.equal(isConfirmedGroupPayout(null,week,'RANDOM',members,'',''),false);
  assert.equal(isConfirmedGroupPayout({...result,selectionMethod:'RANDOM',manualReason:null},week,'RANDOM',members,'',''),true);
});
test('actual server rendering shows frozen member counts and disables financial controls before hydration',()=>{
  const html=renderToStaticMarkup(React.createElement(Panel,{groupId:'g',options:{weeks:[week],members}}));
  assert.match(html,/data-payout-ready="false"/);
  assert.match(html,/<button\b[^>]*disabled=""[^>]*>Run random draw<\/button>/);
  assert.equal((html.match(/<select\b[^>]*disabled=""/g)??[]).length,2);
  assert.equal((html.match(/data-payout-member=/g)??[]).length,2);
  assert.match(html,/Remaining hands: 10/);assert.match(html,/Depleted member/);
});
test('empty eligible weeks or depleted hands expose no financial action',()=>{
  for(const options of [{weeks:[],members},{weeks:[week],members:members.map(m=>({...m,pendingHands:0}))}]){
    const html=renderToStaticMarkup(React.createElement(Panel,{groupId:'g',options}));
    assert.doesNotMatch(html,/Run random draw|Record manual payout/);
  }
});
