# Synthetic mobile browser check

In the staging Codespace on the development branch, install local test tooling:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/verify-group-reads-live.mjs --ui
```

Run commands individually. Stop other Next development servers for this checkout.
Browser launch is checked before fixture creation. Missing system dependencies
may require `npx playwright install --with-deps chromium` in the Codespace.

The guarded runner requires empty staging application tables except existing
LoginAttempt records. It commits temporary synthetic fixtures, opens a local Next
server, and uses a 390-by-844 browser viewport. It chooses a group, checks its
register, creates and edits a member, checks two persisted audits, rejects another
group, and verifies an operator has no add/edit controls. Cleanup deletes only
the fixture member IDs and their synthetic audit records. Require two PASS lines.
Forced termination may leave fixtures: retain the printed identifier and report
the failure without resetting the database. No real payments or payouts are used.

These interactions do not prove visual layout quality, installation/offline PWA
behavior, production-mode cookies or Vercel Preview protection. The browser run
is unconfirmed until the Codespace command passes; syntax and lint alone are not
a browser verification.
