# Group week-completion backend milestone

## Completed prerequisites

The user supplied both backend payment and mobile payment functional PASS plus
cleanup PASS. Preview sign-in was restored through the guarded preview-access
script; sign-in and the selected empty Preview group's no-active-cycle page were
confirmed. That temporary user/group remain in staging until guarded removal.

## Backend behavior

`POST /api/groups/[groupId]/weeks/complete` accepts only `{ weekId }`.
Group ADMIN/OWNER access is required. Global ADMIN gives no bypass.
The serializable transaction rechecks cookie session hash/actor/expiry,
membership, scoped week and ACTIVE cycle, OPEN status, and the existing UTC
boundary after the contribution week's end day. For the locked seven-day cycle,
Sunday must have ended before completion.

All frozen cycle members require every daily slot. Missing/duplicate/invalid day
slots, foreign cycle-member links, empty membership, PARTIAL/UNPAID records, or a
misleading PAID status whose amount differs from the stored positive daily due
are rejected. These are consistency checks for the existing fully-paid rule;
contribution amounts, hand rules and payout policy are unchanged.

Only week status changes to ELIGIBLE. Payment records, hands and payouts are not
changed. The COMPLETE_WEEK audit records authenticated actor, group, cycle and
before/after status atomically. Audit failure rolls back completion. Serializable
conflicts retry up to three attempts; exhaustion returns 409.

Legacy completion is restricted to unassigned cycles and rechecks that scope in
the transaction. This contains that route's grouped-cycle bypass without changing
the single-group unassigned-cycle workflow. Other legacy modules remain separate
migration work; this is not a claim of whole-app group isolation.

## Local checks

Six targeted tests cover Sunday/Monday boundary, ADMIN/OWNER permissions, missing
sessions/revoked transaction access, spoofed fields, incomplete/inconsistent
records, rollback, bounded retries, valid synthetic fixture totals and exact
cleanup scoping. TypeScript, targeted lint, syntax and build checks run before
publication. Live staging HTTP verification remains pending.

## Guarded staging verification

Update the Codespace development branch to the published commit. Before the new
empty-database test, remove the temporary viewing account:

```bash
node scripts/preview-access.mjs --remove
```

Require `PASS: preview account and empty group removed.`. If the guard refuses,
investigate the reported state; do not reset, truncate or seed the database.

Then run:

```bash
node scripts/verify-group-reads-live.mjs --complete-week
```

The existing branch/database host guards and empty application-table checks are
retained. The runner creates 15 synthetic group-A members with the locked 47-hand
allocation and 105 full daily records totaling 16,450 LD for a past week. It also
creates a future group-A week and a group-B completed-cycle week for denial checks.
No real members or contributions are used.

The HTTP checks cover absent/expired/revoked sessions, OPERATOR/MEMBER and global
ADMIN denial, group ADMIN success, cross-origin/other-group requests, unsupported
fields and actor spoofing, future-week denial, missing/partial/inconsistent daily
records, mismatched cycle links, invalid day slots, inactive/already-paid weeks,
repeat completion, audit attribution and concurrent completion. The concurrent
requests must produce exactly one success and one 409, one COMPLETE_WEEK audit,
unchanged payments and no payout. The exact synthetic fixture cleanup preserves
LoginAttempt records and verifies empty application tables.

Require BOTH:

- `PASS: live group week-completion access, completeness, audit and concurrent HTTP checks passed against staging.`
- `PASS: synthetic fixtures removed; application tables empty and login attempts unchanged.`

This tests the updated local Next server against staging Neon. Preview READY is a
separate deployment check and does not prove authenticated completion works.
Audit-failure rollback is tested by local fault injection; the live checker does
not inject a PostgreSQL audit failure.

## Next gate

Keep the group completion button absent until backend staging passes. Then wire
ADMIN/OWNER controls to the scoped endpoint and verify readiness/confirmation,
closed states, revoked access, feedback and mobile use. Payouts remain a separate
milestone. A restored Preview viewing account must be removed again before any
later test requiring empty application tables.
