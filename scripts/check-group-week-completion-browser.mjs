import assert from 'node:assert/strict';
import { weekCompletionIds } from './week-completion-fixture.mjs';

export async function checkGroupWeekCompletionBrowser(chromium, base, token, ids, db) {
  let browser, page, release;
  let check='launch';
  const errors=[], writes=[];
  const endpoint=`/api/groups/${encodeURIComponent(ids.groupA)}/weeks/complete`;
  const paymentEndpoint=`/api/groups/${encodeURIComponent(ids.groupA)}/payments`;
  const f=weekCompletionIds(ids);
  // The calendar reader needs a single finished week, rather than the backend's future-week denial fixture.
  await db.week.deleteMany({where:{id:f.futureWeek,cycleId:ids.cycleA,payments:{none:{}},payout:null}});
  await db.user.update({where:{id:ids.user},data:{role:'VIEWER'}});
  const initialPayments=await db.dailyPayment.findMany({orderBy:{id:'asc'}});
  const initialB=await db.week.findUniqueOrThrow({where:{id:ids.weekB}});
  const initialEnd=(await db.week.findUniqueOrThrow({where:{id:ids.weekA}})).endDate;
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addCookies([{name:'susu_session',value:token,url:base}]);
    page=await context.newPage();page.setDefaultTimeout(30000);
    page.on('pageerror',e=>errors.push(e.name));
    page.on('request',r=>{if(r.method()==='POST' && new URL(r.url()).pathname.includes('/weeks/complete')) writes.push({path:new URL(r.url()).pathname,body:r.postDataJSON()});});
    const open=async()=>{await page.goto(`${base}/current-week?group=${encodeURIComponent(ids.groupA)}`);await page.locator('.payment-table-wrap[data-payment-ready="true"]').waitFor();};
    const button=()=>page.getByRole('button',{name:'Complete week',exact:true});
    const ready=async()=>{await page.locator('[data-completion-ready="true"]').waitFor();};
    const reloadWeek=async()=>{
      const navigation=page.waitForEvent('framenavigated',frame=>frame===page.mainFrame());navigation.catch(()=>{});
      await page.getByRole('button',{name:'Reload week',exact:true}).click();await navigation;
      await page.locator('.payment-table-wrap[data-payment-ready="true"]').waitFor();
    };
    const input=()=>page.getByLabel('Synthetic frozen member 1 Monday payment',{exact:true});
    const auditCount=()=>db.auditLog.count({where:{action:'COMPLETE_WEEK',entityId:ids.weekA}});
    check='operator-hidden';await open();assert.equal(await button().count(),0);
    check='admin-full-week';await db.groupMembership.update({where:{id:ids.membership},data:{role:'ADMIN'}});await open();await ready();
    assert.equal(await page.locator('.payment-table tbody tr').count(),15);
    assert.deepEqual((await page.locator('.stats article strong').allTextContents()).map(s=>s.trim()),['#1','16,450 LD','16,450 LD','0 LD']);
    await button().waitFor({state:'visible'});assert.equal(await button().isEnabled(),true);
    check='cancel-no-write';page.once('dialog',d=>d.dismiss());await button().click();assert.equal(writes.length,0);assert.equal(await auditCount(),0);
    check='incomplete-disabled';await db.dailyPayment.update({where:{id:ids.paymentA},data:{paidAmount:20,status:'PARTIAL'}});await open();await ready();assert.equal(await button().isDisabled(),true);
    check='draft-and-pending-save';await input().fill('200');assert.equal(await button().isDisabled(),true);
    const gate=new Promise(resolve=>{release=resolve;});
    await page.route(`**${paymentEndpoint}`,async r=>{await gate;await r.continue();},{times:1});
    const saved=page.waitForResponse(r=>new URL(r.url()).pathname===paymentEndpoint && r.request().method()==='PATCH');saved.catch(()=>{});
    await page.getByRole('heading',{name:'Daily contribution register',exact:true}).click();
    await page.getByText('Saving payment…',{exact:true}).waitFor();assert.equal(await button().isDisabled(),true);
    release();release=undefined;assert.equal((await saved).status(),200);await page.getByText('Payment saved.',{exact:true}).waitFor();
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Complete week')?.disabled);
    check='sunday-not-ended';const later=new Date();later.setUTCDate(later.getUTCDate()+7);
    await db.week.update({where:{id:ids.weekA},data:{endDate:later}});await open();await ready();assert.equal(await button().isDisabled(),true);
    await db.week.update({where:{id:ids.weekA},data:{endDate:initialEnd}});await open();await ready();
    check='permission-revoked-after-load';await db.groupMembership.update({where:{id:ids.membership},data:{role:'OPERATOR'}});
    page.once('dialog',d=>d.accept());const denied=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint);denied.catch(()=>{});await button().click();assert.equal((await denied).status(),403);
    await page.getByText('Group administrator access required.',{exact:true}).waitFor();assert.equal(await input().isDisabled(),true);assert.equal(await auditCount(),0);
    await reloadWeek();assert.equal(await button().count(),0);
    check='connection-failure';await db.groupMembership.update({where:{id:ids.membership},data:{role:'OWNER'}});await open();await ready();
    await page.route(`**${endpoint}`,r=>r.abort('failed'),{times:1});page.once('dialog',d=>d.accept());await button().click();
    await page.getByText('Could not confirm week completion. Reload before trying again.',{exact:true}).waitFor();assert.equal(await input().isDisabled(),true);assert.equal(await auditCount(),0);
    assert.equal((await db.week.findUniqueOrThrow({where:{id:ids.weekA}})).status,'OPEN');
    check='connection-reload';await reloadWeek();await ready();
    check='owner-completion-ready';await page.waitForFunction(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Complete week');return !!b&&!b.disabled;});
    check='owner-completion-route-setup';const completeGate=new Promise(resolve=>{release=resolve;});
    await page.route(`**${endpoint}`,async r=>{await completeGate;await r.continue();},{times:1});
    page.once('dialog',d=>d.accept());const completed=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint);completed.catch(()=>{});
    const reached=page.waitForRequest(r=>new URL(r.url()).pathname===endpoint&&r.method()==='POST');reached.catch(()=>{});
    // Observe the gated request before awaiting the click's navigation bookkeeping.
    // The gate must be released before a successful completion can reload the page.
    check='owner-completion-request';const click=button().click();click.catch(()=>{});await reached;
    check='owner-completion-pending-lock';await page.getByRole('button',{name:'Completing…',exact:true}).waitFor();assert.equal(await input().isDisabled(),true);
    check='owner-completion-response';release();release=undefined;assert.equal((await completed).status(),200);await click;
    check='owner-completion-closed-reload';await page.getByText('This week is closed for payment editing.',{exact:true}).waitFor();await page.locator('.payment-table-wrap[data-payment-ready="true"]').waitFor();
    assert.equal(await button().count(),0);assert.equal(await input().isDisabled(),true);
    assert.equal((await db.week.findUniqueOrThrow({where:{id:ids.weekA}})).status,'ELIGIBLE');assert.equal(await auditCount(),1);
    const audit=await db.auditLog.findFirstOrThrow({where:{action:'COMPLETE_WEEK',entityId:ids.weekA}});assert.equal(audit.actorId,ids.user);assert.equal(JSON.parse(audit.afterJson).groupId,ids.groupA);
    check='cross-group-denied';await page.goto(`${base}/current-week?group=${encodeURIComponent(ids.groupB)}`);await page.getByText('You do not have staff access to this group.',{exact:true}).waitFor();assert.equal(await button().count(),0);
    assert.deepEqual(await db.week.findUniqueOrThrow({where:{id:ids.weekB}}),initialB);
    // Only the intentional partial/full synthetic payment changed; completion never changes cash records.
    const finalPayments=await db.dailyPayment.findMany({orderBy:{id:'asc'}});
    for(const payment of finalPayments) if(payment.id!==ids.paymentA) assert.deepEqual(payment,initialPayments.find(p=>p.id===payment.id));
    assert.equal((await db.dailyPayment.findUniqueOrThrow({where:{id:ids.paymentA}})).paidAmount,200);
    assert.equal(await db.payout.count(),0);assert.deepEqual(errors,[]);
    assert.equal(writes.length,3);for(const write of writes){assert.equal(write.path,endpoint);assert.deepEqual(write.body,{weekId:ids.weekA});}
  } catch(error) {
    console.error(`Failed week-completion browser check: ${check}.`);
    if(page){
      try {
        const ui=await page.evaluate(()=>({
          completionReady:document.querySelector('[data-completion-ready]')?.getAttribute('data-completion-ready')??null,
          paymentReady:document.querySelector('[data-payment-ready]')?.getAttribute('data-payment-ready')??null,
          completionButtons:Array.from(document.querySelectorAll('button')).filter(b=>['Complete week','Completing…','Reload week'].includes(b.textContent)).map(b=>({label:b.textContent,disabled:b.disabled})),
          paymentInputs:Array.from(document.querySelectorAll('.payment-table input')).length,
          disabledPaymentInputs:Array.from(document.querySelectorAll('.payment-table input')).filter(i=>i.disabled).length,
          alertCount:document.querySelectorAll('[role="alert"]').length,
        }));
        const week=await db.week.findUnique({where:{id:ids.weekA},select:{status:true}});
        console.error('Synthetic completion diagnostic:',JSON.stringify({...ui,completionRequests:writes.length,weekStatus:week?.status??null,clientErrors:errors.length}));
      }catch{console.error('Synthetic completion diagnostic unavailable.');}
    }
    console.error(`Browser failure type: ${['TimeoutError','AssertionError'].includes(error.name)?error.name:'BrowserError'}.`);
    if(errors.length)console.error('Browser client error types:',errors.join(', '));
    throw error;
  } finally {release?.();if(browser)await browser.close();}
}
