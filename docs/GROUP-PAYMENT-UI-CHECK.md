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

## Failed first browser run and focused follow-up

The first user-supplied mobile run stopped at
`draft-totals-and-invalid-input` with TimeoutError. Cleanup PASS was observed;
functional PASS was absent. The original check used Tab on the fixture's last
editable input. The screenshot does not establish whether the blur handler ran.

The follow-up checker uses a pointer click on the register heading to explicitly
leave the field and verifies that the field no longer has focus. It retains all
amount/status/total/no-write assertions. Each invalid value has separate fill,
blur and feedback step labels; a failure prints only the synthetic input's value,
disabled/focus state, validation hint visibility and PATCH request count.
The pending-request observation has a bounded Playwright timeout, and response
wait rejections are handled during failure cleanup. Application code and financial
rules are unchanged by this checker follow-up. Its staging result is still
pending; the change does not establish a root cause or a functional PASS.

## Client-readiness follow-up

The next user screenshot showed `invalid-excessive-feedback` timeout with value
101, disabled=false, focused=false, validationHintVisible=false and zero payment
requests. Cleanup passed. This confirms the field lost focus but feedback/save
handling was absent; it does not independently prove the underlying cause.

PaymentGrid previously emitted enabled OPEN-week inputs in server HTML before
client handlers were ready. It now emits disabled inputs until its client effect
marks the grid ready, and guards saving by that state. Browser checks wait for
`data-payment-ready=true` before interacting. This addresses the pre-hydration
interaction gap described in official Playwright navigation guidance:
https://playwright.dev/docs/navigations#hydration

Failure diagnostics also report readiness, client error counts/types and failed
Next client-request counts, without printing cookies, sessions, credentials or
raw error stacks. Saved totals, financial rules and backend authorization remain
unchanged. A complete staging browser PASS remains pending.
