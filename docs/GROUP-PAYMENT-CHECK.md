# Group payment backend milestone

`PATCH /api/groups/[groupId]/payments` accepts only `{ paymentId, amount }`.
Group OPERATOR, ADMIN or OWNER membership is required; global roles give no bypass.
The serializable transaction rechecks the cookie session (hash, actor, expiry),
membership, both group relationships, equal week/snapshot cycle IDs, ACTIVE cycle
and OPEN week. It validates the amount against the stored daily due, replaces the
absolute recorded amount and atomically writes the authenticated audit.
Positive amounts set paidAt to the recording time; zero clears it, matching the
legacy rule. Concurrent requests serialize; the last successful recording wins.
Serialization failures retry up to three attempts, then return 409 without writes.
The legacy payment endpoint accepts only consistent unassigned-cycle records.

## Validation status

Local payment transaction tests, authorization/session tests, TypeScript, targeted
lint and production build are checked before publication. The rollback test
injects an audit failure; it is a unit test, not a live database failure injection.
Live staging validation is pending until BOTH PASS messages below appear.
Grouped current-week editing remains disabled until backend staging passes.

## Guarded staging HTTP verification

In the Codespace checkout on `advanced-susu-management-upgrade`, update to the
published commit with `git pull --ff-only` after inspecting `git status`.
Use the existing privately configured staging DATABASE_URL and
DATABASE_URL_UNPOOLED; never paste either value into chat.

If the known temporary preview account is still present, run:

```bash
node scripts/preview-access.mjs --remove
```

Require `PASS: preview account and empty group removed.` before proceeding. If
cleanup refuses, investigate; do not reset, truncate or seed the database. If it
was already removed, inspect the database state instead of forcing cleanup.

```bash
node scripts/verify-group-reads-live.mjs --payments
```

This tests the updated local Next server against guarded staging Neon targets,
using synthetic sessions and records only. It does not test the deployed Preview
function directly. It checks partial/full/zero amounts, invalid inputs, actor
spoofing, cross-origin/cross-group access, mismatched relationships, inactive
cycles, closed weeks, global-admin bypass attempts, audit attribution, concurrent
recordings, expiry, and session/membership revocation. Denied requests must leave
payments and audits unchanged. Cleanup targets exact synthetic IDs and preserves
the LoginAttempt baseline.

Require BOTH:

- `PASS: live group payment amounts, access, isolation, audit and concurrent HTTP checks passed against staging.`
- `PASS: synthetic fixtures removed; application tables empty and login attempts unchanged.`

If the named check fails, investigate before rerunning. A cleanup PASS alone is
not a functional PASS. The preview viewing account is removed by this process;
recreating it requires private password entry through the existing guarded tool.

## Pending after backend verification

Enable grouped payment editing, then verify mobile amount/status/totals/error
feedback and selection. Week completion, payouts and other group workflows remain
separate later milestones. No production release or financial-rule change is part
of this milestone.
