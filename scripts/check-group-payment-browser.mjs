import assert from 'node:assert/strict';

export async function checkGroupPaymentBrowser(chromium, base, token, ids, db) {
  let browser;
  let check='launch';
  let page, payment;
  let releasePending;
  const writes=[];
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addCookies([{name:'susu_session',value:token,url:base}]);
    page=await context.newPage(); page.setDefaultTimeout(30000);
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.name));
    const endpoint=`/api/groups/${encodeURIComponent(ids.groupA)}/payments`;
    page.on('request',request=>{if(request.method()==='PATCH') writes.push({path:new URL(request.url()).pathname,body:request.postDataJSON()});});
    payment=page.getByLabel('Synthetic frozen A Monday payment',{exact:true});
    const leaveField=async ()=>{
      // With only one fixture input, Tab can move focus out of the browser document.
      // A real pointer action outside the field makes the blur trigger explicit.
      await page.getByRole('heading',{name:'Daily contribution register',exact:true}).click();
      assert.equal(await payment.evaluate(input=>input===document.activeElement),false,'PAYMENT_FIELD_STILL_FOCUSED');
    };
    const totals=async (paid,balance)=>assert.deepEqual((await page.locator('.stats article strong').allTextContents()).map(s=>s.trim()),['#1','700 LD',`${paid} LD`,`${balance} LD`]);
    const register=async ()=>{
      await payment.waitFor(); assert.equal(await page.locator('.payment-table tbody tr').count(),1);
      assert.equal(await page.getByText('Synthetic frozen B',{exact:true}).count(),0);
      assert.equal(await page.locator('.payment-table thead th').count(),9);
      assert.equal(await page.getByRole('button',{name:/complete week/i}).count(),0);
    };
    const save=async (amount,status)=>{
      const response=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='PATCH');
      response.catch(()=>{});
      await payment.fill(String(amount)); await leaveField();
      assert.equal((await response).status(),200);
      await page.getByText('Payment saved.',{exact:true}).waitFor();
      assert.equal(await payment.inputValue(),amount===0?'':String(amount));
      assert.equal(await page.locator('.payment-status').first().textContent(),status);
      await totals(amount,700-amount);
      const saved=await db.dailyPayment.findUniqueOrThrow({where:{id:ids.paymentA}});
      assert.equal(saved.paidAmount,amount); assert.equal(saved.status,status); assert.equal(saved.recordedById,ids.user);
    };
    check='group-selection'; await page.goto(`${base}/current-week`);
    await page.getByText('Select a group to view its current week.',{exact:true}).waitFor();
    await page.getByLabel('Group',{exact:true}).selectOption(ids.groupA);
    await page.getByRole('button',{name:'Open group',exact:true}).click();
    await register(); assert.equal(await payment.isDisabled(),false); await totals(20,680);
    for(const [label,amount] of [['excessive','101'],['negative','-1'],['decimal','1.5']]) {
      check=`invalid-${label}-fill`;
      const before=writes.length; await payment.fill(amount); await totals(20,680);
      check=`invalid-${label}-blur`; await leaveField();
      check=`invalid-${label}-feedback`;
      await page.getByText('Enter a whole-number amount from 0 to 100 LD.',{exact:true}).waitFor();
      assert.equal(await payment.inputValue(),'20'); assert.equal(writes.length,before); await totals(20,680);
    }
    check='partial-full-zero'; await save(45,'PARTIAL'); await save(100,'PAID'); await save(0,'UNPAID');
    check='unchanged-value-no-write'; const count=writes.length; await payment.focus(); await leaveField(); assert.equal(writes.length,count);
    check='pending-save-lock';
    const gate=new Promise(resolve=>{releasePending=resolve;});
    const reached=page.waitForRequest(r=>new URL(r.url()).pathname===endpoint&&r.method()==='PATCH');
    reached.catch(()=>{});
    await page.route(`**${endpoint}`,async route=>{await gate; await route.continue();},{times:1});
    const response=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='PATCH');
    response.catch(()=>{});
    await payment.fill('60'); await leaveField(); await reached;
    await page.getByText('Saving payment…',{exact:true}).waitFor();
    assert.equal(await payment.isDisabled(),true); await totals(0,700); releasePending();
    assert.equal((await response).status(),200); await page.getByText('Payment saved.',{exact:true}).waitFor(); await totals(60,640);
    check='reload-persistence'; await page.reload(); await register(); assert.equal(await payment.inputValue(),'60'); await totals(60,640);
    check='permission-revoked-after-load';
    const auditCount=await db.auditLog.count();
    await db.groupMembership.update({where:{id:ids.membership},data:{role:'MEMBER'}});
    const denied=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='PATCH');
    denied.catch(()=>{});
    await payment.fill('70'); await leaveField(); assert.equal((await denied).status(),403);
    await page.getByText('Group staff access required.',{exact:true}).waitFor();
    assert.equal(await payment.inputValue(),'60'); assert.equal(await payment.isDisabled(),true); await totals(60,640);
    assert.equal(await db.auditLog.count(),auditCount);
    await page.getByRole('button',{name:'Reload payments',exact:true}).click();
    await page.getByText('You do not have staff access to this group.',{exact:true}).waitFor(); assert.equal(await page.locator('.payment-table').count(),0);
    await db.groupMembership.update({where:{id:ids.membership},data:{role:'OPERATOR'}});
    await page.goto(`${base}/current-week?group=${encodeURIComponent(ids.groupA)}`); await register();
    check='connection-error-keeps-saved-totals';
    await page.route(`**${endpoint}`,route=>route.abort('failed'),{times:1});
    await payment.fill('80'); await leaveField();
    await page.getByText('Could not confirm the payment. Reload before trying again.',{exact:true}).waitFor();
    assert.equal(await payment.inputValue(),'60'); assert.equal(await payment.isDisabled(),true); await totals(60,640);
    assert.equal((await db.dailyPayment.findUniqueOrThrow({where:{id:ids.paymentA}})).paidAmount,60);
    await page.getByRole('button',{name:'Reload payments',exact:true}).click(); await register();
    check='closed-week-read-only';
    await db.week.update({where:{id:ids.weekA},data:{status:'ELIGIBLE'}}); await page.reload(); await register(); assert.equal(await payment.isDisabled(),true);
    await db.week.update({where:{id:ids.weekA},data:{status:'OPEN'}});
    check='cross-group-selection';
    await page.goto(`${base}/current-week?group=${encodeURIComponent(ids.groupB)}`);
    await page.getByText('You do not have staff access to this group.',{exact:true}).waitFor(); assert.equal(await page.locator('.payment-table').count(),0);
    await db.groupMembership.update({where:{id:ids.membership},data:{groupId:ids.groupB}});
    await page.goto(`${base}/current-week?group=${encodeURIComponent(ids.groupB)}`);
    await page.getByText('This group has no active SUSU cycle.',{exact:true}).waitFor(); assert.equal(await page.locator('.payment-table').count(),0);
    assert.equal((await db.dailyPayment.findUniqueOrThrow({where:{id:ids.paymentB}})).paidAmount,75);
    assert.ok(writes.length>=5);
    for(const write of writes) {assert.equal(write.path,endpoint); assert.equal(write.body.paymentId,ids.paymentA); assert.deepEqual(Object.keys(write.body).sort(),['amount','paymentId']);}
    const audits=await db.auditLog.findMany({where:{entityId:ids.paymentA}}); assert.equal(audits.length,4);
    for(const audit of audits) {assert.equal(audit.actorId,ids.user); assert.equal(JSON.parse(audit.afterJson).groupId,ids.groupA);}
    assert.deepEqual(pageErrors,[]);
  } catch(error) {
    console.error(`Failed payment browser check: ${check}.`);
    if(page && payment) {
      try {
        const input=await payment.evaluate(node=>({value:node.value,disabled:node.disabled,focused:node===document.activeElement}));
        const hint=await page.getByText('Enter a whole-number amount from 0 to 100 LD.',{exact:true}).isVisible();
        console.error('Synthetic input diagnostic:',JSON.stringify({...input,validationHintVisible:hint,paymentRequests:writes.length}));
      } catch {console.error('Synthetic input diagnostic unavailable.');}
    }
    console.error(`Browser failure type: ${['TimeoutError','AssertionError'].includes(error.name)?error.name:'BrowserError'}.`);
    throw error;
  } finally {releasePending?.(); if(browser) await browser.close();}
}
