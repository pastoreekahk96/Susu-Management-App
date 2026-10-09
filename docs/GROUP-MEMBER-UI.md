# Member UI transition

`/members` lists the signed-in user's current staff memberships. Selecting a group
opens `/members?group=ID`; reads and writes use only that group's member endpoint.
OWNER/ADMIN see edit controls, OPERATOR sees the register. An explicit invalid or
revoked group selection displays access denied and never falls back to the global
register. A manager is remounted on group changes so drafts and records do not
carry into another group. API membership checks remain authoritative.

Users with no staff memberships and no group query retain the legacy register
until their real records are backfilled. Existing financial navigation remains
global. This compatibility path is not tenant isolation and must be retired
before enabling multiple groups. Group hand counts are not displayed until a
scoped cycle-member read is implemented; legacy hand counts remain available.

Verification: TypeScript, lint and selection boundary tests. Browser interaction
with synthetic group sessions is still required to confirm mobile layout, group
switching, creation/editing and denied selections. Existing staging is empty after
the completed write check, so do not seed real members for UI testing.
