import assert from 'node:assert/strict';

export async function checkGroupCurrentWeekBrowser(chromium, base, token, ids, changeAccess) {
  let browser;
  let check = 'launch';
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: 'susu_session', value: token, url: base }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    check = 'choose-group';
    await page.goto(`${base}/current-week`);
    await page.getByText('Select a group to view its current week.', { exact: true }).waitFor();
    await page.getByLabel('Group', { exact: true }).selectOption(ids.groupA);
    await page.getByRole('button', { name: 'Open group', exact: true }).click();
    check = 'read-only-register';
    const payment = page.getByLabel('Synthetic frozen A Monday payment', { exact: true });
    await payment.waitFor();
    assert.equal(await payment.inputValue(), '20');
    assert.equal(await payment.isDisabled(), true);
    assert.equal(await page.getByText('Synthetic frozen B', { exact: true }).count(), 0);
    assert.equal(await page.locator('.payment-table tbody tr').count(), 1);
    assert.equal(await page.locator('.payment-table thead th').count(), 9);
    assert.equal(await page.getByRole('button', { name: /complete week/i }).count(), 0);
    const stats = await page.locator('.stats article strong').allTextContents();
    assert.deepEqual(stats.map(text => text.replace(/\s+/g, ' ').trim()), ['#1', '700 LD', '20 LD', '680 LD']);
    check = 'preserve-member-link';
    assert.equal(await page.getByRole('link', { name: 'Members', exact: true }).getAttribute('href'), `/members?group=${encodeURIComponent(ids.groupA)}`);
    check = 'deny-other-group';
    await page.goto(`${base}/current-week?group=${encodeURIComponent(ids.groupB)}`);
    await page.getByText('You do not have staff access to this group.', { exact: true }).waitFor();
    assert.equal(await page.locator('.payment-table').count(), 0);
    check = 'no-active-cycle';
    await changeAccess('GROUP_B');
    await page.goto(`${base}/current-week?group=${encodeURIComponent(ids.groupB)}`);
    await page.getByText('This group has no active SUSU cycle.', { exact: true }).waitFor();
    assert.equal(await page.locator('.payment-table').count(), 0);
    check = 'deny-member';
    await changeAccess('GROUP_A');
    await changeAccess('MEMBER');
    await page.goto(`${base}/current-week?group=${encodeURIComponent(ids.groupA)}`);
    await page.getByText('You do not have staff access to this group.', { exact: true }).waitFor();
    assert.equal(await page.locator('.payment-table').count(), 0);
  } catch (error) {
    console.error(`Failed current-week browser check: ${check}.`);
    console.error(`Browser failure type: ${['TimeoutError', 'AssertionError'].includes(error.name) ? error.name : 'BrowserError'}.`);
    throw error;
  } finally { if (browser) await browser.close(); }
}
