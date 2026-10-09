# Live staging read-path check

On the development branch in the Codespace with staging URLs configured:

```bash
node scripts/verify-group-reads-live.mjs
```

Run without another local Next development server for this checkout. Avoid other
staging activity during the check. The script refuses non-staging targets and any
existing application data except LoginAttempt records. It commits temporary
synthetic users, groups, members, completed cycle metadata and a hashed session
so a separate local Next server can see them. There are no payments or payouts.
It checks real session cookies and Prisma resource queries via localhost, then
stops its server and deletes only its exact synthetic IDs in a transaction.
LoginAttempt records must remain identical. Require both PASS messages.

Unlike the backfill rehearsal, these fixtures are briefly committed. A forced
process termination or lost database connection can leave fixtures behind.
Retain the printed fixture identifier and report the failure; never reset the
database or delete unrelated records. No successful verification is confirmed
on cleanup failure. Cleanup refuses cycles that gained members, hands or weeks.

This verifies the local app using staging data, not Vercel production-mode cookie
attributes, Preview protection or deployed caching. Those remain separate checks.
