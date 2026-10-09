export async function checkGroupMemberBrowser(chromium, base, token, ids, control) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: 'susu_session', value: token, url: base }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await control.role('ADMIN');
    await page.goto(`${base}/members`);
    await page.getByText('Select a group to view its member register.').waitFor();
    await page.getByLabel('Group', { exact: true }).selectOption(ids.groupA);
    await page.getByRole('button', { name: 'Open group', exact: true }).click();
    await page.getByText(ids.memberNameA, { exact: true }).waitFor();
    if (await page.getByText(ids.otherName, { exact: true }).count()) throw new Error('BROWSER_GROUP_LEAK');
    await page.getByLabel('Member name', { exact: true }).fill(ids.newName);
    await page.getByRole('button', { name: 'Add member', exact: true }).click();
    await page.getByText(ids.newName, { exact: true }).waitFor();
    const row = page.locator('.member-row').filter({ has: page.getByText(ids.newName, { exact: true }) });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const editingRow = page.locator('.member-row').filter({ has: page.getByRole('button', { name: 'Save', exact: true }) });
    await editingRow.getByLabel('Member name', { exact: true }).fill(`${ids.newName} edited`);
    await editingRow.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText(`${ids.newName} edited`, { exact: true }).waitFor();
    await control.verifyCreated(`${ids.newName} edited`);
    await page.goto(`${base}/members?group=${encodeURIComponent(ids.groupB)}`);
    await page.getByText('You do not have staff access to this group.').waitFor();
    if (await page.locator('.member-row').count()) throw new Error('BROWSER_DENIED_REGISTER_VISIBLE');
    await control.role('OPERATOR');
    await page.goto(`${base}/members?group=${encodeURIComponent(ids.groupA)}`);
    await page.getByText(ids.memberNameA, { exact: true }).waitFor();
    if (await page.getByRole('button', { name: 'Add member', exact: true }).count() || await page.getByRole('button', { name: 'Edit', exact: true }).count()) throw new Error('BROWSER_OPERATOR_EDIT_VISIBLE');
  } finally { await browser.close(); }
}
