# SUSU Management App

A database-backed SUSU management application for a Liberian susu group.

## Current application scope

The app is a responsive web application/PWA for managing the active SUSU cycle, members, daily contributions, weekly completion, payouts, reports, and audit history.

### Locked business rules

- 47 hands
- 15 members
- 50 LD per hand per day
- Contributions run Monday through Sunday
- Sunday completes the contribution week
- Weekly collection/payout amount: 16,450 LD
- 47 payout weeks
- One individual hand is drawn per completed week
- A member's multiple hands are independent payout spots
- The active cycle is snapshotted so later member changes do not rewrite this cycle
- A payout can only exist once per week and once per hand
- Partial daily payments are supported; unpaid balances remain recorded separately
- Payout selection supports RANDOM and ADMIN-only MANUAL selection
- Payment, week-completion, payout, member, and authentication-sensitive operations are protected by role-based access and audited

## Cycle dates

- Week 1: September 14–20, 2026
- Week 47: August 2–8, 2027
- Payout eligibility begins only after the Sunday end of each week and after required contributions are complete.

## Main modules

- Dashboard
- Current week payment register
- Member management
- Historical weeks
- Payouts and payout history
- Reports
- Admin audit log
- Session-based authentication with VIEWER, OPERATOR, and ADMIN roles
- Installable PWA metadata and mobile usability support

The current production workflow is intentionally read/write only where operationally required. Historical views, reports, payout history, and audit history are read-only.

## Production stack

- Next.js 15 + TypeScript
- React 19
- PostgreSQL
- Prisma ORM
- Neon PostgreSQL through Vercel
- GitHub for source control
- Vercel for production deployment

Production application:

- https://susu-management-app.vercel.app/

## Local setup

1. Install Node.js 20+.
2. Install dependencies:
   `npm install`
3. Create `.env` with the required PostgreSQL connection variables:
   - `DATABASE_URL`
   - `DATABASE_URL_UNPOOLED`
4. Generate Prisma Client:
   `npm run db:generate`
5. Apply existing migrations:
   `npm run db:deploy`
6. For a new development database, use Prisma migration tooling as appropriate.
7. Seed development data when needed:
   `npm run db:seed`
8. Start the app:
   `npm run dev`

## Production database deployment

The production build runs:

`prisma migrate deploy && prisma generate && next build`

This means checked-in Prisma migrations are applied before the Next.js production build completes.

Do not run the seed command against the production database unless intentionally performing a controlled data operation.

## Development workflow

Use a one-change-at-a-time workflow:

1. Inspect the current implementation and production state.
2. Make one logical change.
3. Commit it to GitHub.
4. Allow Vercel to build and deploy.
5. Confirm the production deployment is READY.
6. Test the affected behavior.
7. Check recent runtime errors.
8. Only then continue to the next change.

Never use a real payout or real financial mutation merely as a test.

## PWA and mobile behavior

The app includes a web manifest, application metadata, app icons, safe-area handling, touch-friendly controls, and responsive layouts.

A service worker/offline cache is intentionally not included at this stage because stale cached financial data could be unsafe. Online, server-authoritative data is preferred for contribution and payout operations.
