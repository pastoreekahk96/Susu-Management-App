# Legacy audit viewer containment

The global `/audit` viewer is restricted to the original ungrouped installation.
It still requires a valid session and global ADMIN role. Once any Group exists,
it shows a generic unavailable message and does not query or render audit records,
actor details, entity IDs, counts, or before/after state. This applies even to a
group OWNER or ADMIN. A group query failure propagates; there is no fallback read.

The group check and bounded audit query share a RepeatableRead transaction, so
concurrent group creation cannot mix a no-group check with newer grouped audit
rows. No financial data, audits, memberships, or schema are changed.

This deliberately blocks mixed grouped/legacy history. AuditLog has no durable
group ownership field, and actor membership, current entity links and optional
JSON fields cannot prove historical access. Do not remove groups to re-enable
this viewer. Group deletion/archive and historical audit retention need review
before such lifecycle operations are introduced. A future group audit feature
must establish persisted ownership and authorized access; this containment is
not that feature and does not fix other legacy pages.

## Verification

Run the focused local synthetic dependency tests:

```bash
node --import tsx --test tests/legacy-audit-reader.test.mjs tests/legacy-audit-page.test.mjs
```

They cover anonymous/non-admin rejection before database access, global ADMIN
denial with any group (including an empty group), no audit query on denial,
legacy history/empty state, bounded ordering, a consistent transaction snapshot,
and fail-closed database errors. The actual server page is also rendered with
synthetic dependencies to check that denial includes no record or actor details,
the legacy view remains usable, and unauthorized users retain their redirects.
No database connection or fixture writes occur.
Type checking, lint and build are separate checks. These local checks do not
establish authenticated deployed or staging database verification.

Both week-completion and payout mobile checks remain parked and unverified.
No production merge, migration or financial test is part of this change.
