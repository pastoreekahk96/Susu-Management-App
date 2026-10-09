# Group member and cycle reads

New read-only endpoints:

- `GET /api/groups/[groupId]/members`
- `GET /api/groups/[groupId]/cycles`

Fresh session identity and explicit group membership are required. OWNER, ADMIN
and OPERATOR memberships can read the directory; MEMBER cannot until own-member
mapping exists. Global user roles grant no bypass. Anonymous requests return 401,
missing or insufficient memberships return 403 without revealing group existence.
Every resource query filters by the authorized group ID; null legacy records are
excluded. Responses select only directory/snapshot fields and do not include
payments, sessions, user credentials or audit details.

This is the first read-path migration step. Existing `/api/members`, server pages
and financial routes retain their legacy global access and are not isolated yet.
Do not enable multiple groups or remove global uniqueness constraints until
those paths are transitioned and cross-group integration tests pass. The UI is
not connected to these new endpoints yet. No new cycle is created by this change.

Local integration tests exercise the production HTTP handler functions with
hashed synthetic sessions, persisted memberships and two groups in a disposable
PostgreSQL-compatible database. They cover 401/403/200/500, global ADMIN without
membership, MEMBER denial, revocation, expiry and resource projection. A test
adapter translates Prisma query arguments to SQL; real Prisma transport, Next
cookie wiring and authenticated Preview requests remain unverified.

Next: verify deployed session-based access, then transition member
writes and the UI with an explicit active-group context. Follow with financial
routes, reports and audit visibility. Backfill is still a separate controlled task.
