# Group payout history backend

GET `/api/groups/[groupId]/payouts/history` requires current group OPERATOR, ADMIN or OWNER membership. Global ADMIN cannot bypass membership. History covers every cycle status within the requested group and preserves frozen member names, individual hand numbers, selection method/reason, recorder attribution, DRAWN/COLLECTED status and collection timestamps. This read does not confirm cash collection or write financial records.

All week, hand and frozen snapshot cycle relations must belong to the group. Inconsistent same-group cross-cycle links fail generically. Results use descending drawn time and ID order, with at most 100 rows and an optional scoped `cursor`; `nextCursor` is null at the end. Unknown, duplicated or empty query parameters are rejected. Foreign and missing cursors return the same generic 404. Responses are private/no-store and omit recorder email and authentication fields.

The legacy history page is restricted to unassigned active cycles and consistent unassigned hand/snapshot relations. The group history interface remains a separate milestone.

Run in the staging Codespace on the development branch:

```bash
node scripts/verify-group-reads-live.mjs --payout-history
```

The existing branch/database/empty-table guards apply. The fixture creates synthetic selected/collected records only, including a foreign completed-cycle history entry. HTTP checks cover roles, anonymous/revoked/expired access, global role independence, cursor isolation, frozen data, completed cycles, legacy isolation and financial read-only behavior. Exact synthetic fixtures are removed; login attempts must remain unchanged. No browser checks run in this mode.

Require BOTH functional PASS and cleanup PASS. Local checks and Preview READY do not establish staging functionality. Completion and payout UI browser checks remain parked by user instruction, unverified.
