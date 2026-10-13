# Group current-week payment UI milestone

## Backend prerequisite

On 13 October 2026 the user supplied a screenshot showing BOTH functional group
payment HTTP PASS and cleanup PASS for the backend at commit 6af310c. The synthetic
application tables were empty and LoginAttempt records unchanged after that run.

## Implemented interface

The selected group's OPEN week now permits payment editing through
`PATCH /api/groups/[groupId]/payments`. Group staff access is checked by the
existing authorized reader and verified backend. Closed weeks remain disabled.
Week completion and payout controls are not enabled on this page.

The grid keeps typed draft values separate from saved rows. Amount-paid, balance,
member totals and status change only after an accepted API response. Invalid
amounts restore the saved field without sending a request. Unchanged amounts do
not create another write/audit. A synchronous pending guard and disabled controls
prevent overlapping saves within the register. A stale permission/week or an
unconfirmed connection requires reload before retrying. The optional groupId
keeps the legacy grid's endpoint compatible. The group/week component key clears
old local state when changing context.

## Checks

Run after updating the development branch and confirming Preview READY:

```bash
node scripts/verify-group-reads-live.mjs --payment-ui
```

Use the existing privately configured guarded staging database variables.
Playwright and Chromium are required; the browser preflight runs before database
writes. If BROWSER_DEPENDENCY_MISSING appears, install the existing browser
prerequisites before retrying. Do not reset or seed any database.

The synthetic 390×844 mobile browser checks:

- Group choice, frozen name, seven day columns and no payout/completion controls.
- Partial/full/zero saves, field status, member identity, actor audits and weekly totals.
- Negative/decimal/excessive input rejected before any HTTP write.
- Unsaved drafts do not change saved totals; pending saves lock inputs.
- Unchanged blur sends no duplicate request; saved data survives reload.
- Membership revoked after page load produces denial, preserves saved totals and
  disables editing; reload removes the inaccessible register.
- An intentionally aborted API request displays an unconfirmed-save message,
  restores the last known values, and requires reload (this abort is a browser
  failure simulation, not database failure injection).
- Closed-week disabled editing, cross-group denial, B with no active cycle,
  unchanged B payment, no legacy payment request, and no browser page errors.

Require BOTH:

- `PASS: mobile group payment editing, saved totals, permissions and error feedback passed against staging.`
- `PASS: synthetic fixtures removed; application tables empty and login attempts unchanged.`

The functional staging browser result remains pending until both messages are
observed. Local component browser tests with simulated API responses, where run,
are separate evidence and do not replace this end-to-end staging check.

The older --current-week-ui check still verifies read/selection behavior without
performing writes; it now expects enabled controls on the synthetic OPEN week.
Its unchanged financial snapshot requirement is preserved.
