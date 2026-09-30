# SUSU Management App

A database-backed SUSU management application for a Liberian susu group.

## Locked business rules

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

## Cycle dates

- Week 1: September 14–20, 2026
- Week 47: August 2–8, 2027
- Payout eligibility begins after the Sunday end of each week.

## Local setup

1. Install Node.js 20+.
2. Install dependencies:
   `npm install`
3. Create `.env` with a PostgreSQL `DATABASE_URL`.
4. Generate Prisma Client:
   `npm run db:generate`
5. Create the database schema:
   `npm run db:migrate -- --name init`
6. Seed the 15 members, 47 hands, 47 weeks, and daily payment records:
   `npm run db:seed`
7. Start the app:
   `npm run dev`

The next implementation layer will replace the dashboard's temporary display data with PostgreSQL-backed queries, then add payment recording and the protected random-draw workflow.
