# SUSU Multi-Tenant Migration Rehearsal Plan

## Purpose

Introduce group tenancy without changing the meaning of existing SUSU financial data.

This document is the safety gate before any Prisma migration is added to the advanced branch.

## Current baseline

- Branch: `advanced-susu-management-upgrade`
- Existing production/main remains untouched.
- Current data model is single-group.
- Existing cycle is the current 47-hand SUSU.
- Existing database migration `20261005160000_enforce_single_active_cycle` currently enforces one ACTIVE cycle globally.

## Critical deployment rule

The application build runs:

```
prisma migrate deploy && prisma generate && next build
```

Therefore, a preview deployment can execute database migrations against the database configured for that Vercel environment.

**No tenancy migration may be committed or deployed until Preview/Development has a database that is safe to modify.**

## Target data model

```text
User
  |
  +-- GroupMembership -- Group
                          |
                          +-- Member
                          +-- Cycle
                               |
                               +-- CycleMember
                               +-- CycleHand
                               +-- Week
                                    +-- DailyPayment
                                    +-- Payout
                          |
                          +-- AuditLog
```

## Migration strategy

### Step 0 — Safety snapshot

Before changing the schema:

1. Obtain a verified backup/snapshot of the current database.
2. Record current row counts for:
   - User
   - Member
   - Cycle
   - CycleMember
   - CycleHand
   - Week
   - DailyPayment
   - Payout
   - AuditLog
   - Session
   - LoginAttempt
3. Record financial invariants:
   - total hands = 47
   - weekly payout = 16,450 LD
   - cycle payout positions = 47
   - each hand can be selected at most once
4. Record the currently ACTIVE cycle.
5. Record existing users and their current global roles.

The backup must be recoverable before continuing.

### Step 1 — Add tenancy tables and nullable links

Introduce:

- Group
- GroupMembership
- group-level role enum: OWNER, ADMIN, OPERATOR, MEMBER

Initially add group references as nullable where existing records need backfilling.

Do not remove the existing User.role yet.

Reason: this allows the application and data migration to move in controlled stages instead of requiring an all-at-once cutover.

### Step 2 — Create the first group

Create exactly one initial group representing the existing SUSU.

Recommended source for its identity:

- group name: derived from the existing active cycle name, with an explicit fallback if needed.

Create the first GroupMembership records from the existing User access model.

The current administrator becomes OWNER of the initial group.

Other existing authorized users receive the closest equivalent group role.

### Step 3 — Backfill existing records

Attach current records to the initial group:

- Member.groupId
- Cycle.groupId
- AuditLog.groupId where the audited entity can be resolved to this group

Do not duplicate or recreate financial rows.

Existing IDs must remain unchanged.

For audit events that are truly platform-level or cannot safely be resolved to a group, groupId may remain nullable.

### Step 4 — Change uniqueness rules

The current Member.name uniqueness is global.

Replace it with group-scoped uniqueness:

```text
UNIQUE(groupId, name)
```

This permits two separate groups to have members with the same name while preventing duplicates inside one group.

### Step 5 — Replace global active-cycle constraint

Current constraint:

```text
UNIQUE(status) WHERE status = 'ACTIVE'
```

This is invalid for multi-tenancy because it permits only one active cycle across the entire platform.

Target constraint:

```text
UNIQUE(groupId) WHERE status = 'ACTIVE'
```

Meaning:

- Group A may have one ACTIVE cycle.
- Group B may have one ACTIVE cycle.
- Group A cannot have two ACTIVE cycles.

### Step 6 — Make required group links non-null

Only after the backfill has been verified:

- Member.groupId becomes required.
- Cycle.groupId becomes required.

AuditLog.groupId may remain nullable for platform-level events.

### Step 7 — Introduce group-aware authorization

Replace global financial authorization with:

1. authenticate User;
2. resolve active Group context;
3. resolve GroupMembership;
4. verify required role;
5. constrain every database query by that group.

Never trust a client-supplied group ID by itself.

## Required tenant isolation rules

Every protected route must follow the pattern:

```text
authenticated user
    -> authorized group membership
    -> group-scoped resource lookup
    -> operation
```

Never:

```text
client resource ID
    -> database lookup
    -> operation
```

Examples:

- Payment ID must resolve to a payment whose week belongs to a cycle in the active group.
- Payout ID must resolve to a payout whose week/cycle belongs to the active group.
- Hand ID must resolve to a hand in the active group.
- Member ID must resolve to a member in the active group.
- Audit queries must be group-scoped.
- Member portal queries must additionally restrict data to the logged-in member.

## Financial verification after migration

The migrated first group must satisfy all of the following:

### Structure

- 15 members
- 47 hands
- 47 weeks
- existing CycleMember rows preserved
- existing CycleHand rows preserved

### Financial rules

- 50 LD per hand per day
- 2,350 LD total daily contribution
- 16,450 LD weekly payout
- 47 payout positions
- 773,150 LD full-cycle contribution/payout total

### Historical integrity

- Existing payment amounts unchanged.
- Existing payment dates unchanged.
- Existing payment statuses unchanged.
- Existing payout selections unchanged.
- Existing payout amounts unchanged.
- Existing audit records preserved.
- Existing session/authentication data preserved unless a deliberate security migration requires otherwise.

## Cross-tenant security tests

Before production:

### Test A — Group A cannot read Group B

Use a valid Group A user and attempt to request:

- Group B member ID
- Group B cycle ID
- Group B week ID
- Group B payment ID
- Group B payout ID
- Group B audit ID

Expected result: not found/forbidden without leaking private data.

### Test B — Group A cannot mutate Group B

Attempt:

- payment update
- member update
- week completion
- payout
- member creation/update
- group settings update

Expected result: denied server-side.

### Test C — Multiple ownership

Create:

- User X -> OWNER of Group A
- User X -> OWNER of Group B

Verify the same account can switch groups and see only the selected group's data.

### Test D — Different roles

Verify one user may be:

- OWNER in Group A
- OPERATOR in Group B

The authorization decision must follow the active group's membership, not the user's global role.

### Test E — Member isolation

A MEMBER account must not be able to access:

- staff payment registers
- all-member reports
- payout administration
- audit logs
- group administration
- another member's private financial history

## Preview database gate

Before the first migration commit, verify:

- Vercel Preview uses a non-production DATABASE_URL.
- Vercel Development/preview migrations cannot modify the production Neon database.
- The test database contains a disposable copy of the current schema/data.
- A failed migration can be restored.
- A preview deployment can run `prisma migrate deploy` safely.

If any of these conditions is unknown, stop before adding a migration.

## Rollout order

1. Establish safe development/staging database.
2. Copy/rehearse current production data.
3. Add Group and GroupMembership schema.
4. Backfill first group.
5. Verify counts and financial invariants.
6. Add group-scoped constraints.
7. Add group-aware authorization.
8. Run cross-tenant security tests.
9. Deploy to preview.
10. Verify preview against staging database.
11. Only after explicit production approval, plan the production migration.
12. Keep main untouched until the advanced upgrade is explicitly approved.

## Definition of success

The migration is successful only if:

- no financial rows are lost;
- no financial values change unexpectedly;
- the 47-hand SUSU remains financially identical;
- multiple groups can coexist;
- one user can own multiple groups;
- group isolation is enforced server-side;
- the active-cycle constraint is per group;
- member names are unique per group rather than globally;
- audit history remains available;
- the migration can be repeated safely on a staging copy;
- production has not been modified accidentally.
