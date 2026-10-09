export async function checkGroupMemberBrowser(chromium, base, token, ids, control) {
  let browser;
  let check = 'launch-browser';
  try {
    browser = await chromium.launch({ headless: true });
    check = 'create-context';
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: 'susu_session', value: token, url: base }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    check = 'set-admin-role';
    await control.role('ADMIN');
    check = 'open-group-selector';
    await page.goto(`${base}/members`);
    await page.getByText('Select a group to view its member register.').waitFor();
    check = 'select-group';
    await page.locator('select[name="group"]').selectOption(ids.groupA);
    check = 'submit-group';
    await page.getByRole('button', { name: 'Open group', exact: true }).click();
    check = 'load-group-register';
    await page.getByText(ids.memberNameA, { exact: true }).waitFor();
    if (await page.getByText(ids.otherName, { exact: true }).count()) throw new Error('BROWSER_GROUP_LEAK');
    check = 'create-member';
    await page.getByLabel('Member name', { exact: true }).fill(ids.newName);
    await page.getByRole('button', { name: 'Add member', exact: true }).click();
    await page.getByText(ids.newName, { exact: true }).waitFor();
    check = 'open-member-editor';
    const row = page.locator('.member-row').filter({ has: page.getByText(ids.newName, { exact: true }) });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    check = 'save-member-edit';
    const editingRow = page.locator('.member-row').filter({ has: page.getByRole('button', { name: 'Save', exact: true }) });
    await editingRow.getByLabel('Member name', { exact: true }).fill(`${ids.newName} edited`);
    await editingRow.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText(`${ids.newName} edited`, { exact: true }).waitFor();
    check = 'verify-member-and-audits';
    await control.verifyCreated(`${ids.newName} edited`);
    check = 'deny-other-group';
    await page.goto(`${base}/members?group=${encodeURIComponent(ids.groupB)}`);
    await page.getByText('You do not have staff access to this group.').waitFor();
    if (await page.locator('.member-row').count()) throw new Error('BROWSER_DENIED_REGISTER_VISIBLE');
    check = 'verify-operator-controls';
    await control.role('OPERATOR');
    await page.goto(`${base}/members?group=${encodeURIComponent(ids.groupA)}`);
    await page.getByText(ids.memberNameA, { exact: true }).waitFor();
    if (await page.getByRole('button', { name: 'Add member', exact: true }).count() || await page.getByRole('button', { name: 'Edit', exact: true }).count()) throw new Error('BROWSER_OPERATOR_EDIT_VISIBLE');
  } catch (error) {
    console.error(`Failed browser check: ${check}.`);
    const kind = ['TimeoutError', 'AssertionError', 'PrismaClientKnownRequestError', 'PrismaClientValidationError'].includes(error.name) ? error.name : 'BrowserError';
    console.error(`Browser failure type: ${kind}.`);
    throw error;
  } finally { if (browser) await browser.close(); }
}
