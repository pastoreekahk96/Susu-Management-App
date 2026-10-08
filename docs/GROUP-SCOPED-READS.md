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

Next: add staging session-based tests for these endpoints, then transition member
writes and the UI with an explicit active-group context. Follow with financial
routes, reports and audit visibility. Backfill is still a separate controlled task.
