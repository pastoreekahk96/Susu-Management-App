# Staging migration runbook

Target GitHub branch: `advanced-susu-management-upgrade`.
Target Neon project: `advanced-susu-management-staging`, database `neondb`.

## Before running
1. Confirm the project in Neon. For first-time setup only, check that the public schema is empty. For an initialized database, inspect existing migration history instead; never reset it.
2. Use the **direct/unpooled** connection from this staging project, not the production database.
3. Confirm the direct hostname exactly matches `ep-shiny-snow-b75mtlqx.c-13.us-east-1.aws.neon.tech`.
4. Never paste connection strings into GitHub files, logs or chat.
5. Confirm `git branch --show-current` reports `advanced-susu-management-upgrade`, pull the reviewed commit, and check both connection hostnames and the database name without printing credentials. The pooled hostname must be `ep-shiny-snow-b75mtlqx-pooler.c-13.us-east-1.aws.neon.tech` and the database must be `neondb`.
6. Run `DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate status` first. Compare any pending migrations with the reviewed migration files; do not assume a fixed number. Stop on unexpected pending, failed, or divergent migrations.
7. Only after verifying the branch, connection target, and migration list, run `DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate deploy` from the advanced branch.
8. Do **not** run `prisma db seed` or create real payment/payout data.

## After running
Rerun `DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate status` and expect `Database schema is up to date`. Query `public._prisma_migrations` and verify the reviewed migrations finished successfully and are not rolled back. Check that the expected application tables exist. Inspect the staging Preview for runtime errors.

As of the October 8 foundation checkpoint, six migrations have been applied to
staging, including `20261008190000_add_group_membership_foundation`. This is a
checkpoint, not a hard-coded expectation for future upgrades. Staging has not
been deliberately seeded and does not yet establish a financial backfill rehearsal.

The standard Vercel build must remain `prisma generate && next build`. Do not add migrations back to automatic builds.

Do not merge to `main` without explicit approval.
