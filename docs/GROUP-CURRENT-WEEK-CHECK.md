# Staging current-week read check

Run on `advanced-susu-management-upgrade` with the previously verified staging pooled and direct database environment variables:

```bash
node scripts/verify-group-reads-live.mjs --current-week
```

The runner rejects nonempty application tables, preserves the exact LoginAttempt baseline, and creates synthetic fixtures only. One active cycle belongs to A; B has a completed cycle. Each has a frozen member snapshot and one partial daily payment. This intentionally small fixture verifies read isolation rather than cycle creation or financial eligibility.

Real local HTTP requests exercise cookies, session checks, membership changes and Prisma queries. Checks cover anonymous access, staff access, other and nonexistent groups, MEMBER denial, membership revocation, session expiry, frozen names, partial cash values, and no fallback to A when authorized for B with no active cycle. Financial records and audits must remain unchanged before cleanup.

Require both the current-week PASS and fixture-cleanup PASS. Cleanup targets exact synthetic IDs and parent relationships and verifies empty application tables and unchanged login attempts. Do not reset or seed to fix a failure. A forcibly terminated process can leave committed synthetic fixtures; inspect before retrying.

This does not verify the current-week page or payment, week-completion, or payout mutations. Those remain separate milestones.

## Mobile current-week page

After the HTTP check has passed, run the page-specific browser check (Playwright and Chromium must already be installed):

```bash
node scripts/verify-group-reads-live.mjs --current-week-ui
```

This reuses the guarded synthetic fixture. It checks group selection, the frozen member name, Monday partial amount of 20 LD, seven day columns, weekly totals, disabled payment controls, preserved Members navigation, denied cross-group access, B's no-active-cycle page, and MEMBER denial. The page shares the endpoint's authorized reader. Financial records and audits must remain unchanged, and both browser PASS and cleanup PASS are required.

Grouped views are read-only. The legacy current-week path remains for accounts without staff groups and without an explicit group query during the migration; the whole app is not yet group-isolated.
