# Rollback-only synthetic group backfill rehearsal

Run from `advanced-susu-management-upgrade` after all seven migrations through
`20261008203000_add_nullable_member_cycle_groups` are applied to staging.

```bash
git pull --ff-only
node scripts/rehearse-group-backfill.mjs
```

The script verifies both staging hostnames and `neondb`, chooses the direct
connection, and refuses any nonempty application table. It never resets tables,
uses production credentials, invokes the seed script, or runs financial API routes.

Within a serializable transaction it locks the application tables, creates
fictional identities and the 15-member / 47-hand / 47-week structure, then
attaches Member and Cycle records to a synthetic group with an OWNER membership.
The 4,935 daily records include one fully paid historical week and one partial
payment in an open week. A synthetic historical payout preserves the one-hand
selection structure. These amounts are fixture values, not real collected money.

It compares complete records before/after, excluding only the new group links.
It verifies counts, expected full-cycle contributions of 773,150 LD, synthetic
collections of 16,470 LD, a synthetic payout of 16,450 LD, matching member/cycle
group relationships, and repeated null-only assignment without further changes.

Every successful rehearsal deliberately throws a private rollback marker.
Only after Prisma confirms that rollback and empty-table checks pass does the
script print the report and success messages. It has no commit path. A failure
inside the transaction also rolls back. Stop on an error; do not reset or seed.
While running, other application writes may wait for its table locks.

Local tests use disposable PGlite PostgreSQL with the same SQL fixture:

```bash
PGLITE_PACKAGE_JSON=/tmp/susu-migration-check/package.json node --test tests/group-backfill-rehearsal.test.mjs
```

They cover target guards, preservation, repeated runs, deliberate tampering
detection, and rollback. Neon staging execution remains a separate checkpoint.

This tests the backfill strategy, not a production backfill implementation.
It does not prove financial API behavior or cross-group access isolation.
Audit records are preserved; adding audit tenancy is a later additive change.
Global uniqueness and active-cycle constraints remain unchanged.
