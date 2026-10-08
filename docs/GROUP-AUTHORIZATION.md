# Group authorization foundation

Server routes can call `requireGroupRole(groupId, requiredRole)` from
`lib/group-auth.ts`. The helper authenticates using the existing session and
looks up the unique `(userId, groupId)` membership on every call.
It returns only `userId`, `groupId`, and the group role.

| Required role | Allowed group roles |
| --- | --- |
| OWNER | OWNER |
| ADMIN | OWNER, ADMIN |
| OPERATOR | OWNER, ADMIN, OPERATOR |
| MEMBER | OWNER, ADMIN, OPERATOR, MEMBER |

There is no fallback to the global user role. Missing sessions produce
`AUTH_REQUIRED`; missing membership and insufficient privileges produce
`FORBIDDEN`. Database errors propagate to the caller's error handler.

This helper is not yet wired into the existing single-group financial routes.
Those routes retain their existing authorization until resource tenancy is
implemented. Multiple financial groups must remain disabled during that work.

Every future resource query must additionally constrain the resource to the
returned `groupId`. Membership alone does not authorize an arbitrary payment,
week, hand, or member ID. MEMBER access also requires a user-to-member link and
an own-record filter; this helper does not implement that portal policy.

## Verification

Run `node --import tsx --test tests/*.test.ts`, or with Node 24:
`node --experimental-strip-types --test tests/group-authorization.test.ts`.

The tests use dependency-injected synthetic identities and memberships. They
cover the complete role matrix, cross-group denial, no global-admin bypass,
revocation, invalid context, and database failures. They do not connect to a
database or prove end-to-end financial route isolation. Staging integration
and cross-group resource tests remain required before enabling multiple groups.

No schema migration, seed, or financial operation is needed for this change.

Session authentication reads are also read-only: missing, revoked, or expired
sessions return no user without changing cookies during Server Component
rendering. Login/logout own cookie mutation; login also cleans expired session
rows. Session regression tests cover expiry boundaries and revocation.
