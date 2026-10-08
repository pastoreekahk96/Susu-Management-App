# Staging migration runbook

Target GitHub branch: `advanced-susu-management-upgrade`.
Target Neon project: `advanced-susu-management-staging`, database `neondb`.

## Before running
1. Confirm the project in Neon and check that the public schema is empty.
2. Use the **direct/unpooled** connection from this staging project, not the production database.
3. Confirm the direct hostname exactly matches `ep-shiny-snow-b75mtlqx.c-13.us-east-1.aws.neon.tech`.
4. Never paste connection strings into GitHub files, logs or chat.
5. Run `npx prisma migrate status` first and verify it reports the five pending existing migrations.
6. Only after verifying the connection target, run `npx prisma migrate deploy` from the advanced branch.
7. Do **not** run `prisma db seed` or create real payment/payout data.

## After running
Query `public._prisma_migrations` and ensure all five migrations completed with no errors. Check that the expected application tables exist. Inspect the staging Preview for runtime errors.

The standard Vercel build must remain `prisma generate && next build`. Do not add migrations back to automatic builds.

Do not merge to `main` without explicit approval.
