# Nullable member and cycle group links

Migration: `20261008203000_add_nullable_member_cycle_groups`.

This additive step introduces optional `Member.groupId` and `Cycle.groupId`,
indexed and referencing `Group.id`. Deleting a referenced group is restricted.
Existing rows retain their IDs and all existing values; their new group links
remain NULL. No group is created and no rows are backfilled automatically.

The global member-name uniqueness and `Cycle_one_active_key` remain unchanged.
Financial routes still use the original single-group behavior. Do not enable
multiple financial groups until backfill, constraints, authorization, and
resource scoping have all been verified. These nullable links alone do not
prevent a CycleMember from linking a member and cycle in different groups.
That integrity check is required in the later backfill and tenant cutover.

## Local migration verification

`tests/nullable-group-migration.test.mjs` uses a disposable in-memory PGlite
PostgreSQL engine. It applies the preceding migrations, creates synthetic
structural fixtures, applies this migration, and compares preserved records.
It checks nullable links, invalid foreign keys, restricted group deletion,
indexes, and continued global uniqueness. The fixtures test schema behavior,
not a completed valid financial cycle or financial workflow eligibility.

Run with the optional dependency outside the application repository:

```bash
npm install --prefix /tmp/susu-migration-check --ignore-scripts --no-audit --no-fund @electric-sql/pglite
PGLITE_PACKAGE_JSON=/tmp/susu-migration-check/package.json node --test tests/nullable-group-migration.test.mjs
```

This test does not use connection environment variables and does not replace
verification against the actual Neon staging database.

## Staging application

Follow `docs/STAGING-MIGRATION-RUNBOOK.md`. Verify the advanced branch and both
staging database destinations before running any mutation. Review migration
status and expect this migration to be the sole new pending migration at this
checkpoint. Stop if the migration list differs.

Apply using the verified direct staging connection:

```bash
DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate deploy
DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate status
```

Builds do not run migrations. Prisma Client now knows the new columns, so
authenticated member/cycle queries may fail on this Preview until staging has
the migration. READY alone does not verify database readiness.

## Read-only verification after applying

```sql
SELECT table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('Member', 'Cycle') AND column_name = 'groupId';

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('Member_groupId_idx', 'Cycle_groupId_idx',
                    'Member_name_key', 'Cycle_one_active_key');

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN ('Member_groupId_fkey', 'Cycle_groupId_fkey');

SELECT 'Member' AS entity, COUNT(*) AS total,
       COUNT("groupId") AS assigned FROM "Member"
UNION ALL
SELECT 'Cycle', COUNT(*), COUNT("groupId") FROM "Cycle";
```

Expect two nullable text columns, both new foreign keys and indexes, and both
existing uniqueness indexes. Assignment counts should remain zero immediately
after this migration on the unseeded staging checkpoint.

The next step is a separate controlled backfill rehearsal using synthetic
staging fixtures, checking record counts, snapshots, amounts, and relationships.
Do not seed or modify the production group.
