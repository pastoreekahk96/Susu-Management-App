# Group payout options: first backend milestone

## Scope and current state

On October 13, 2026 the user authorized deferring mobile week-completion verification and continuing development. That browser milestone remains UNVERIFIED; see GROUP-WEEK-COMPLETION-UI-CHECK.md for the failures and release requirement. Its backend staging PASS remains recorded.

This change adds `GET /api/groups/[groupId]/payouts/options`. It does not add group payout selection writes, cash collection confirmation, or the group payout interface. It performs no financial writes. Local validation and Preview deployment do not establish staging functionality.

## Design and compatibility

- Require fresh session identity and group ADMIN/OWNER membership. Global ADMIN does not grant access to another group; global VIEWER with group ADMIN/OWNER can read these options.
- Read the selected group's ACTIVE cycle only. Return empty weeks/members if it has none.
- Offer only scoped ELIGIBLE weeks without an existing payout. Return the frozen cycle payout amount and UTC dates.
- Show each frozen cycle member once, with the number of individual PENDING hands in the same cycle that have no payout. Selected hands and inconsistent cross-cycle hands are excluded. Members with zero remaining hands remain visible with count zero for the future interface to disable.
- Keep responses private and uncached; return generic failures without underlying database details.
- Restrict both legacy payout GET and POST to unassigned cycles (`groupId: null`). Recheck that the legacy week belongs to an ACTIVE, unassigned cycle inside its transaction. The legacy global-admin interface can no longer draw group-owned hands through this route.
- Preserve schema constraints and all locked SUSU amounts, schedule, frozen snapshots and one-hand-per-week rules. No migration, seed, production data write, or production deployment is part of this milestone.

Options are a current read, not a guarantee that a later write is allowed. The upcoming group POST must recheck session, membership, week, cycle and selected hand inside a serializable transaction.

## Guarded staging verification

Run in the development Codespace with existing guarded staging variables and empty application tables. Do not recreate the temporary Preview account or print connection strings. This check uses local Next HTTP and Prisma queries; it needs no browser.

```bash
node scripts/verify-group-reads-live.mjs --payout-options
```

Require BOTH:

- `PASS: live group payout options, permissions, legacy restriction and read-only checks passed against staging.`
- `PASS: synthetic fixtures removed; application tables empty and login attempts unchanged.`

The fixture uses synthetic 15-member/47-hand records and a fully paid ELIGIBLE week. The check exercises anonymous, OPERATOR, ADMIN, OWNER, absent/foreign group, global ADMIN without membership, revoked membership, expired session and no-active-cycle responses. It verifies exact frozen names/counts, excludes the OPEN future week, checks private/no-store headers, and compares all financial records before/after. A legacy POST against the group fixture must be rejected without recording a payout. Cleanup removes only exact synthetic hands without payouts before the existing week-completion fixture cleanup. Login attempts remain untouched.

Staging functionality is PENDING until both messages are verified. Cleanup PASS alone is insufficient.

## Next milestone after options verification

Implement group RANDOM/MANUAL payout selection and recording in one atomic transaction: ADMIN/OWNER only; exact accepted fields; manual reason up to 500 characters; fresh transactional session/membership; ACTIVE group cycle and ELIGIBLE scoped week; one PENDING hand from the same frozen member/cycle; server crypto selection; unique week/hand protection; atomic hand selection, DRAWN payout, PAID week and authenticated group audit. Cover concurrent requests and audit rollback. Group UI and COLLECTED confirmation remain separate milestones.
