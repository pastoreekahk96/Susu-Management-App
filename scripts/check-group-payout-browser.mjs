import assert from 'node:assert/strict';
import { weekCompletionIds } from './week-completion-fixture.mjs';
import { browserFailureFacts } from './browser-failure-diagnostics.mjs';

export async function checkGroupPayoutBrowser(chromium,base,token,ids,db) {
  let browser,page,release,check='launch';
  const endpoint=`/api/groups/${encodeURIComponent(ids.groupA)}/payouts`;
  const writes=[],errors=[];const lifecycle={crashed:false,closed:false,disconnected:false};
  const f=weekCompletionIds(ids);
  const payments=JSON.stringify(await db.dailyPayment.findMany({orderBy:{id:'asc'}}));
  const other=JSON.stringify(await db.week.findUniqueOrThrow({where:{id:ids.weekB}}));
  try {
    await db.user.update({where:{id:ids.user},data:{role:'VIEWER'}});
    browser=await chromium.launch({headless:true});browser.on('disconnected',()=>{lifecycle.disconnected=true;});
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addCookies([{name:'susu_session',value:token,url:base}]);
    page=await context.newPage();page.setDefaultTimeout(30000);
    page.on('crash',()=>{lifecycle.crashed=true;});page.on('close',()=>{lifecycle.closed=true;});
    page.on('pageerror',()=>errors.push('ClientError'));
    page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.endsWith('/payouts'))writes.push({path:new URL(request.url()).pathname,body:request.postDataJSON()});});
    const open=async()=>{await page.goto(`${base}/payouts?group=${encodeURIComponent(ids.groupA)}`);};
    const ready=async()=>{await page.locator('[data-payout-ready="true"]').waitFor();};
    const random=()=>page.getByRole('button',{name:'Run random draw',exact:true});
    const manual=()=>page.getByRole('button',{name:'Record manual payout',exact:true});
    const reload=async(label)=>{
      check=`${label}-click-and-document`;
      await Promise.all([page.waitForEvent('domcontentloaded'),page.getByRole('button',{name:'Reload payout options',exact:true}).click()]);
      check=`${label}-ready`;await ready();
    };
    const assertLocked=async()=>{for(const control of await page.locator('.payout-panel select,.payout-panel textarea,.payout-panel button:not(.secondary)').all())assert.equal(await control.isDisabled(),true);};
    check='operator-denied';await open();await page.getByText('Group administrator access required for payouts.',{exact:true}).waitFor();assert.equal(await page.locator('[data-payout-ready]').count(),0);
    check='admin-group-choice';await db.groupMembership.update({where:{id:ids.membership},data:{role:'ADMIN'}});
    await page.goto(`${base}/payouts`);await page.getByLabel('Group',{exact:true}).selectOption(ids.groupA);
    await Promise.all([page.waitForEvent('domcontentloaded'),page.getByRole('button',{name:'Open group',exact:true}).click()]);
    check='admin-options';await ready();
    await page.getByText('Remaining hands: 47',{exact:true}).click();
    check='admin-member-count';assert.equal(await page.locator('[data-payout-member]').count(),15);
    check='admin-mobile-width';assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
    check='admin-button-ready';assert.equal(await random().isEnabled(),true);
    check='admin-week-count';assert.equal(await page.getByLabel('Eligible week',{exact:true}).locator('option').count(),2);
    check='cancel-no-write';page.once('dialog',dialog=>dialog.dismiss());await random().click();assert.equal(writes.length,0);assert.equal(await db.payout.count(),0);
    check='unconfirmed-success';await page.route(`**${endpoint}`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'unconfirmed'})}),{times:1});
    page.once('dialog',dialog=>dialog.accept());await random().click();await page.getByText('Could not confirm payout selection. Reload before trying again.',{exact:true}).waitFor();await assertLocked();assert.equal(await db.payout.count(),0);
    await reload('unconfirmed-reload');
    check='manual-validation';await page.getByLabel('Selection method',{exact:true}).selectOption('MANUAL');assert.equal(await manual().isDisabled(),true);
    await page.getByLabel('Member',{exact:true}).selectOption(f.snapshots[5]);await page.getByLabel('Reason',{exact:true}).fill(' ');assert.equal(await manual().isDisabled(),true);
    await page.getByLabel('Reason',{exact:true}).fill('Synthetic emergency');assert.equal(await manual().isEnabled(),true);
    check='manual-pending-route';const gate=new Promise(resolve=>{release=resolve;});await page.route(`**${endpoint}`,async route=>{await gate;await route.continue();},{times:1});
    const reached=page.waitForRequest(r=>new URL(r.url()).pathname===endpoint&&r.method()==='POST');reached.catch(()=>{});
    const saved=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='POST');saved.catch(()=>{});
    let confirmation='';page.once('dialog',dialog=>{confirmation=dialog.message();return dialog.accept();});
    check='manual-request';const click=manual().click();click.catch(()=>{});await reached;
    assert.match(confirmation,/Exactly one remaining hand/);assert.match(confirmation,/16,450 LD/);assert.match(confirmation,/Cash collection is confirmed separately/);
    check='manual-pending-lock';await page.getByRole('button',{name:'Recording selection…',exact:true}).waitFor();await assertLocked();
    check='manual-response';release();release=undefined;assert.equal((await saved).status(),200);await click;
    check='manual-success';await page.getByRole('heading',{name:'Payout selection recorded',exact:true}).waitFor();await page.getByText('Cash collection has not been confirmed.',{exact:true}).waitFor();await assertLocked();
    assert.equal(await db.cycleHand.count({where:{cycleMemberId:f.snapshots[5],status:'PENDING'}}),9);assert.equal(await db.payout.count(),1);
    await reload('manual-reload');assert.equal(await page.getByLabel('Eligible week',{exact:true}).locator('option').count(),1);
    check='revoked-after-load';await db.groupMembership.update({where:{id:ids.membership},data:{role:'OPERATOR'}});
    page.once('dialog',dialog=>dialog.accept());await random().click();await page.getByText('Group administrator access required.',{exact:true}).waitFor();await assertLocked();assert.equal(await db.payout.count(),1);
    check='revoked-reload';await Promise.all([page.waitForEvent('domcontentloaded'),page.getByRole('button',{name:'Reload payout options',exact:true}).click()]);
    await page.getByText('Group administrator access required for payouts.',{exact:true}).waitFor();assert.equal(await random().count(),0);
    check='owner-options';await db.groupMembership.update({where:{id:ids.membership},data:{role:'OWNER'}});await open();await ready();
    check='connection-failure';await page.route(`**${endpoint}`,route=>route.abort('failed'),{times:1});page.once('dialog',dialog=>dialog.accept());await random().click();
    await page.getByText('Could not confirm payout selection. Reload before trying again.',{exact:true}).waitFor();await assertLocked();assert.equal(await db.payout.count(),1);
    await reload('connection-reload');
    check='random-owner-selection';page.once('dialog',dialog=>dialog.accept());await random().click();await page.getByRole('heading',{name:'Payout selection recorded',exact:true}).waitFor();await assertLocked();
    await reload('random-reload');await page.getByText('No eligible payout week is available. Complete fully paid weeks after Sunday ends.',{exact:true}).waitFor();assert.equal(await random().count(),0);
    check='financial-and-audit';const payouts=await db.payout.findMany({orderBy:{weekId:'asc'}});assert.equal(payouts.length,2);assert.notEqual(payouts[0].handId,payouts[1].handId);
    assert.equal(await db.cycleHand.count({where:{cycleId:ids.cycleA,status:'SELECTED'}}),2);assert.equal(await db.cycleHand.count({where:{cycleId:ids.cycleA,status:'PENDING'}}),45);
    for(const payout of payouts){assert.equal(payout.amount,16450);assert.equal(payout.recordedById,ids.user);assert.equal(payout.status,'DRAWN');assert.equal(payout.collectedAt,null);
      const audits=await db.auditLog.findMany({where:{entityId:payout.id,entityType:'Payout'}});assert.equal(audits.length,1);assert.equal(audits[0].actorId,ids.user);assert.equal(JSON.parse(audits[0].afterJson).groupId,ids.groupA);}
    assert.equal(JSON.stringify(await db.dailyPayment.findMany({orderBy:{id:'asc'}})),payments);assert.equal(JSON.stringify(await db.week.findUniqueOrThrow({where:{id:ids.weekB}})),other);
    check='foreign-group-denied';await page.goto(`${base}/payouts?group=${encodeURIComponent(ids.groupB)}`);await page.getByText('Group administrator access required for payouts.',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-payout-ready]').count(),0);assert.equal(await page.getByText('Synthetic frozen member 6',{exact:true}).count(),0);
    assert.equal(writes.length,5);for(const write of writes){assert.equal(write.path,endpoint);assert.ok([ids.weekA,f.futureWeek].includes(write.body.weekId));
      assert.deepEqual(Object.keys(write.body).sort(),write.body.method==='MANUAL'?['memberId','method','reason','weekId']:['method','weekId']);}
    assert.equal(writes.filter(w=>w.body.method==='MANUAL').length,1);assert.deepEqual(errors,[]);
  }catch(error){
    console.error(`Failed payout browser check: ${check}.`);console.error('Safe payout browser diagnostic:',JSON.stringify({failure:browserFailureFacts(error),lifecycle,requests:writes.length,clientErrors:errors.length}));
    if(page&&!page.isClosed())try {
      const ui=await page.evaluate(()=>({
        viewport:window.innerWidth,documentWidth:document.documentElement.scrollWidth,
        memberRows:document.querySelectorAll('[data-payout-member]').length,
        payoutReady:document.querySelector('[data-payout-ready]')?.getAttribute('data-payout-ready')??null,
        eligibleWeekOptions:document.querySelector('.payout-panel select')?.querySelectorAll('option').length??0,
        randomDisabled:Array.from(document.querySelectorAll('.payout-panel button')).find(button=>button.textContent==='Run random draw')?.disabled??null,
        layout:['.shell','.payout-panel','.payout-panel details','.payout-panel table','.member-add-form'].map(selector=>{
          const element=document.querySelector(selector),box=element?.getBoundingClientRect();
          return{region:selector,width:box?Math.round(box.width):null,right:box?Math.round(box.right):null,scrollWidth:element?.scrollWidth??null};
        }),
      }));console.error('Safe payout UI diagnostic:',JSON.stringify(ui));
    }catch{console.error('Payout UI diagnostic unavailable.');}
    throw error;
  }finally{release?.();if(browser)await browser.close();}
}
