import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { browserFailureFacts, browserNetworkCode } from './browser-failure-diagnostics.mjs';
import { weekCompletionIds } from './week-completion-fixture.mjs';

export async function checkGroupWeekCompletionBrowser(chromium, base, token, ids, db) {
  let browser, page, release;
  let check='launch';
  const errors=[], writes=[];
  const network={failedDocuments:0,failedScripts:0,failedStylesheets:0,badScripts:0,badStylesheets:0};
  let navigation=null, reads=null;
  const lifecycle={closed:false,crashed:false,disconnected:false};
  const completionStatuses=[];
  const documentFailures=[];
  let lastDocumentResponse=null;
  const locationKind=url=>{try{const path=new URL(url).pathname;return path==='/current-week'?'current-week':path==='/login'?'login':'other';}catch{return 'unknown';}};
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
    browser.on('disconnected',()=>{lifecycle.disconnected=true;});
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addCookies([{name:'susu_session',value:token,url:base}]);
    page=await context.newPage();page.setDefaultTimeout(30000);
    page.on('close',()=>{lifecycle.closed=true;});page.on('crash',()=>{lifecycle.crashed=true;});
    page.on('pageerror',e=>errors.push(['TypeError','ReferenceError','SyntaxError'].includes(e.name)?e.name:'ClientError'));
    page.on('requestfailed',r=>{if(r.resourceType()==='document')documentFailures.push(browserNetworkCode(r.failure()?.errorText)??'UNKNOWN');const key={document:'failedDocuments',script:'failedScripts',stylesheet:'failedStylesheets'}[r.resourceType()];if(key)network[key]++;});
    page.on('response',r=>{if(r.request().resourceType()==='document'&&r.frame()===page.mainFrame())lastDocumentResponse={status:r.status(),location:locationKind(r.url())};if(new URL(r.url()).pathname===endpoint&&r.request().method()==='POST')completionStatuses.push(r.status());if(r.status()<400)return;const key={script:'badScripts',stylesheet:'badStylesheets'}[r.request().resourceType()];if(key)network[key]++;});
    page.on('request',r=>{if(r.method()==='POST' && new URL(r.url()).pathname.includes('/weeks/complete')) writes.push({path:new URL(r.url()).pathname,body:r.postDataJSON()});});
    const open=async(label)=>{
      check=`${label}-navigation`;navigation=null;
      const response=await page.goto(`${base}/current-week?group=${encodeURIComponent(ids.groupA)}`);
      navigation={status:response?.status()??null,location:locationKind(page.url()),redirected:!!response?.request().redirectedFrom()};
      check=`${label}-register-render`;await page.locator('.payment-table-wrap').waitFor();
      check=`${label}-payment-client-ready`;await page.locator('.payment-table-wrap[data-payment-ready="true"]').waitFor();
      check=label;
    };
    const button=()=>page.getByRole('button',{name:'Complete week',exact:true});
    const ready=async()=>{await page.locator('[data-completion-ready="true"]').waitFor();};
    const reloadWeek=async(label)=>{
      check=`${label}-navigation-listener`;
      const navigation=page.waitForEvent('framenavigated',frame=>frame===page.mainFrame());navigation.catch(()=>{});
      check=`${label}-click`;await page.getByRole('button',{name:'Reload week',exact:true}).click();
      check=`${label}-navigation`;await navigation;
      check=`${label}-document-ready`;await page.waitForLoadState('domcontentloaded');
      check=`${label}-register-render`;await page.locator('.payment-table-wrap').waitFor();
      check=`${label}-payment-client-ready`;await page.locator('.payment-table-wrap[data-payment-ready="true"]').waitFor();
    };
    const input=()=>page.getByLabel('Synthetic frozen member 1 Monday payment',{exact:true});
    const auditCount=()=>db.auditLog.count({where:{action:'COMPLETE_WEEK',entityId:ids.weekA}});
    check='operator-session-read';
    const auth=await context.request.get(`${base}/api/auth/me`);
    const user=await auth.json().catch(()=>null);
    reads={authStatus:auth.status(),syntheticUser:user?.user?.id===ids.user};
    check='operator-current-week-read';
    const current=await context.request.get(`${base}/api/groups/${encodeURIComponent(ids.groupA)}/current-week`);
    const data=await current.json().catch(()=>null);
    Object.assign(reads,{weekReadStatus:current.status(),syntheticCycle:data?.cycle?.id===ids.cycleA,syntheticWeek:data?.week?.id===ids.weekA,
      memberCount:Array.isArray(data?.members)?data.members.length:null,
      paymentCount:Array.isArray(data?.members)?data.members.reduce((sum,m)=>sum+(Array.isArray(m.payments)?m.payments.length:0),0):null});
    // Record evidence without treating an API success as proof that the page rendered.
    await open('operator-hidden');assert.equal(await button().count(),0);
    check='admin-full-week';await db.groupMembership.update({where:{id:ids.membership},data:{role:'ADMIN'}});await open(check);await ready();
    assert.equal(await page.locator('.payment-table tbody tr').count(),15);
    assert.deepEqual((await page.locator('.stats article strong').allTextContents()).map(s=>s.trim()),['#1','16,450 LD','16,450 LD','0 LD']);
    await button().waitFor({state:'visible'});assert.equal(await button().isEnabled(),true);
    check='cancel-no-write';page.once('dialog',d=>d.dismiss());await button().click();assert.equal(writes.length,0);assert.equal(await auditCount(),0);
    check='incomplete-disabled';await db.dailyPayment.update({where:{id:ids.paymentA},data:{paidAmount:20,status:'PARTIAL'}});await open(check);await ready();assert.equal(await button().isDisabled(),true);
    check='draft-and-pending-save';await input().fill('200');assert.equal(await button().isDisabled(),true);
    const gate=new Promise(resolve=>{release=resolve;});
    await page.route(`**${paymentEndpoint}`,async r=>{await gate;await r.continue();},{times:1});
    const saved=page.waitForResponse(r=>new URL(r.url()).pathname===paymentEndpoint && r.request().method()==='PATCH');saved.catch(()=>{});
    await page.getByRole('heading',{name:'Daily contribution register',exact:true}).click();
    await page.getByText('Saving payment…',{exact:true}).waitFor();assert.equal(await button().isDisabled(),true);
    release();release=undefined;assert.equal((await saved).status(),200);await page.getByText('Payment saved.',{exact:true}).waitFor();
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Complete week')?.disabled);
    check='sunday-not-ended';const later=new Date();later.setUTCDate(later.getUTCDate()+7);
    await db.week.update({where:{id:ids.weekA},data:{endDate:later}});await open(check);await ready();assert.equal(await button().isDisabled(),true);
    await db.week.update({where:{id:ids.weekA},data:{endDate:initialEnd}});await open(check);await ready();
    check='permission-revoked-membership';await db.groupMembership.update({where:{id:ids.membership},data:{role:'OPERATOR'}});
    check='permission-revoked-response-listener';page.once('dialog',d=>d.accept());
    const denied=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='POST');denied.catch(()=>{});
    check='permission-revoked-click';await button().click();
    check='permission-revoked-response';assert.equal((await denied).status(),403);
    check='permission-revoked-feedback';await page.getByText('Group administrator access required.',{exact:true}).waitFor();
    check='permission-revoked-payment-lock';assert.equal(await input().isDisabled(),true);
    check='permission-revoked-no-audit';assert.equal(await auditCount(),0);
    await reloadWeek('permission-revoked-reload');
    check='permission-revoked-control-hidden';assert.equal(await button().count(),0);
    check='connection-failure';await db.groupMembership.update({where:{id:ids.membership},data:{role:'OWNER'}});await open(check);await ready();
    await page.route(`**${endpoint}`,r=>r.abort('failed'),{times:1});page.once('dialog',d=>d.accept());await button().click();
    await page.getByText('Could not confirm week completion. Reload before trying again.',{exact:true}).waitFor();assert.equal(await input().isDisabled(),true);assert.equal(await auditCount(),0);
    assert.equal((await db.week.findUniqueOrThrow({where:{id:ids.weekA}})).status,'OPEN');
    await reloadWeek('connection-reload');check='connection-reload-completion-ready';await ready();
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
    console.error('Safe browser failure facts:',JSON.stringify(browserFailureFacts(error)));
    console.error('Browser run diagnostic:',JSON.stringify({localServerPort:Number(new URL(base).port),documentFailures,lastDocumentResponse,navigation,currentLocation:page?locationKind(page.url()):'unknown',reads,network,lifecycle,
      completionRequests:writes.length,completionStatuses,clientErrors:errors.length}));
    if(page){
      try {
        const ui=await page.evaluate(()=>({
          pageStates:{
            login:!!document.querySelector('input[type="password"]'),
            denied:document.body.textContent.includes('You do not have staff access to this group.'),
            readFailed:document.body.textContent.includes("Unable to load this group's current week."),
            noCycle:document.body.textContent.includes('No active cycle'),
            noWeek:document.body.textContent.includes('No week is available for this group.'),
            chooseGroup:document.body.textContent.includes('Select a group to view its current week.'),
            register:!!document.querySelector('.payment-table-wrap'),
            frameworkError:document.body.textContent.includes('Application error:'),
            loading:!!document.querySelector('[aria-busy="true"],[role="progressbar"]'),
          },
          completionReady:document.querySelector('[data-completion-ready]')?.getAttribute('data-completion-ready')??null,
          paymentReady:document.querySelector('[data-payment-ready]')?.getAttribute('data-payment-ready')??null,
          completionButtons:Array.from(document.querySelectorAll('button')).filter(b=>['Complete week','Completing…','Reload week'].includes(b.textContent)).map(b=>({label:b.textContent,disabled:b.disabled})),
          paymentInputs:Array.from(document.querySelectorAll('.payment-table input')).length,
          disabledPaymentInputs:Array.from(document.querySelectorAll('.payment-table input')).filter(i=>i.disabled).length,
          alertCount:document.querySelectorAll('[role="alert"]').length,
        }));
        console.error('Synthetic page diagnostic:',JSON.stringify(ui));
      }catch(diagnosticError){console.error('Synthetic page diagnostic unavailable:',JSON.stringify(browserFailureFacts(diagnosticError)));}
    }
    try {
        const week=await db.week.findUnique({where:{id:ids.weekA},select:{status:true,cycleId:true}});
        const session=await db.session.findUnique({where:{id:ids.session},select:{userId:true,tokenHash:true,expiresAt:true}});
        const membership=await db.groupMembership.findUnique({where:{id:ids.membership},select:{userId:true,groupId:true,role:true}});
        const cycle=await db.cycle.findUnique({where:{id:ids.cycleA},select:{groupId:true,status:true}});
        const fixtureReads={sessionMatches:session?.userId===ids.user&&session?.tokenHash===createHash('sha256').update(token).digest('hex'),
          sessionUnexpired:!!session&&session.expiresAt>new Date(),membershipMatches:membership?.userId===ids.user&&membership?.groupId===ids.groupA,
          membershipRole:membership?.role??null,cycleMatches:cycle?.groupId===ids.groupA,cycleStatus:cycle?.status??null,weekMatches:week?.cycleId===ids.cycleA,
          scopedMembers:await db.cycleMember.count({where:{cycleId:ids.cycleA}}),
          scopedPayments:await db.dailyPayment.count({where:{weekId:ids.weekA,cycleMember:{cycleId:ids.cycleA}}})};
        console.error('Synthetic database diagnostic:',JSON.stringify({fixtureReads,weekStatus:week?.status??null,
          completionAudits:await db.auditLog.count({where:{action:'COMPLETE_WEEK',entityId:ids.weekA,actorId:ids.user}})}));
    }catch{console.error('Synthetic database diagnostic unavailable.');}
    console.error(`Browser failure type: ${['TimeoutError','AssertionError'].includes(error.name)?error.name:'BrowserError'}.`);
    if(errors.length)console.error('Browser client error types:',errors.join(', '));
    throw error;
  } finally {release?.();if(browser)await browser.close();}
}
