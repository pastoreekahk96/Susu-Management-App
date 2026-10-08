# Read-only group backfill inspection

Run on `advanced-susu-management-upgrade` with the existing staging environment:

```bash
node scripts/inspect-group-backfill.mjs
```

The script accepts no arguments and permits only the vetted staging Neon target.
It uses a PostgreSQL read-only, repeatable-read transaction. It reports counts,
unassigned Member/Cycle records, inconsistent CycleMember group links, financial
totals, and existing administrator IDs/names. It never prints passwords, session
tokens, login-attempt keys, or database URLs. Do not post administrator details publicly.

An administrator is only an owner candidate: global ADMIN does not automatically
grant group ownership. No user, group or membership is created or selected.
The empty staging database should report zero candidates and no backfill needed;
do not seed real member records to change that result.

Before implementing persistent writes, review an explicit target group and owner,
the precise set of records, cross-record group consistency, a backup/recovery plan,
and full-record preservation comparisons. Test the actual write implementation
using synthetic records and repeat it to verify idempotence. This inspection is
not authorization for a production backfill or proof of API group isolation.
Keep the global member-name and active-cycle constraints until financial routes
are scoped and tested. No production command is provided here.
