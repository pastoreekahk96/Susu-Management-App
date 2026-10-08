# Controlled legacy attachment step

`scripts/group-backfill-step.mjs` exports an internal transaction step. It has no
CLI or API entry point and is not called by builds or the running app.

The caller supplies an explicit existing group ID and user ID. That user must
already hold an OWNER membership in that group. Global administrator status
alone is insufficient. The step creates no group, user, membership or audit row.
It refuses records assigned to any other group; this is a single legacy-group
attachment, not a general multi-group migration.

Inside a caller-owned transaction it locks all application tables, attaches only
null Member/Cycle group links, verifies member-cycle consistency, and compares
every other field of every application record before and after. IDs, timestamps,
payments, payout history, sessions, login attempts and audit rows are preserved.
Repeated attachment returns zero updates.

The caller MUST roll back if the step throws. Do not catch an error and commit.
No persistent runner is enabled yet. A runner will need staging target guards,
serializable transaction settings, explicit reviewed record scope and ownership,
preflight counts, recovery arrangements and post-commit verification. Table locks
can block application writes, so any eventual real-data run needs a maintenance
window. Current synthetic tests run entirely in a local disposable database and
roll back. The staging rehearsal now also calls this exported implementation
against those synthetic fixtures, verifies 15 member/1 cycle attachments and
zero changes on repetition, then rolls back. Run after pulling this commit:

```bash
node scripts/rehearse-group-backfill.mjs
```

Expect three PASS lines, including "actual backfill implementation". Existing
LoginAttempt rows may remain and are verified unchanged; all other application
tables must be empty before the rehearsal. No successful staging run is confirmed
until the command finishes with those PASS lines.

This change does not enable multiple financial groups or scope existing APIs.
