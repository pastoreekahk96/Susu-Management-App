# Group member creation and editing

`POST /api/groups/[groupId]/members` accepts only `{name}`.
`PATCH` on the same endpoint accepts `{id,name?,active?}` and requires a change
field. Both require OWNER or ADMIN membership. Session identity determines the
audit actor; client actor/group reassignment fields are rejected.

Membership is rechecked inside the serializable write transaction. Member lookup
and update filter by both member ID and authorized group ID. Another group's ID
and an unassigned legacy ID return the same 404 as a nonexistent ID. Creation
sets the authorized group ID. Audit insertion is atomic with the member write.
Cycle snapshots, hands, payments and payouts are never edited here.

Names remain globally unique while migration is incomplete. A conflict returns
generic 409 without naming another group's member. Serialization conflicts also
return 409; clients may retry. Existing same-origin validation is retained.

Legacy `/api/members` and the existing UI remain global and must be transitioned
before multi-group access is enabled. AuditLog has no dedicated group column yet;
these writes include groupId in the audit snapshot, but audit viewer scoping is
still outstanding. Local tests cover handlers. Live staging write verification:

```bash
npx prisma generate
node scripts/verify-group-reads-live.mjs --writes
```

This reuses the guarded local-server fixture runner without repeating the completed
read test. It checks anonymous/operator/cross-group/cross-origin denial, legacy
member denial, rejected reassignment fields, duplicate-name handling, successful
creation/editing, and persisted audit records. Existing fixture members and cycle
snapshots must remain unchanged. Cleanup removes the exact synthetic created member
and its two audit records along with the original fixtures. Require both PASS lines.
The run briefly commits synthetic records; forced termination can leave fixtures,
so retain its printed identifier and report failures without resetting the database.

The checker connects to 127.0.0.1 but sends the localhost origin used by Next's
development Request.url. A real local Next check confirmed localhost reaches
the expected anonymous 401 while the numeric origin is rejected with 403.
Application same-origin protection is unchanged. Status failures now identify
the named check and expected/actual status without printing cookies or records.
