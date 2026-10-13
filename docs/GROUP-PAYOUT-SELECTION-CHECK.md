# Group payout selection and recording

## Prerequisites and scope

Payout-options staging verification passed on October 13, 2026 with both functional and cleanup PASS at `921b09c`. Mobile week-completion verification is explicitly deferred by the user and remains UNVERIFIED. Its backend staging verification remains passed. No production release is authorized.

This milestone adds `POST /api/groups/[groupId]/payouts` for selecting and recording exactly one hand. It does not add the group payout interface or confirm that cash was collected. The saved payout remains DRAWN, with collectedAt null, preserving the existing separation between selection and collection.

## Request and transaction

- RANDOM accepts exactly `{weekId, method: "RANDOM"}`.
- MANUAL accepts exactly `{weekId, method: "MANUAL", memberId, reason}`. memberId is the frozen CycleMember ID supplied by payout options, not the mutable Member ID. The trimmed reason must be nonempty and at most 500 characters.
- Reject actor, group, amount, status, hand and other unsupported client fields. Same-origin validation uses the existing policy.
- Require group ADMIN/OWNER. Global ADMIN does not bypass membership; global VIEWER with group ADMIN/OWNER can act.
- Recheck the unexpired session hash and group membership inside every serializable transaction attempt.
- The week must belong to the requested group's ACTIVE cycle, be ELIGIBLE and have finished its UTC Sunday boundary. Existing payouts are rejected.
- Validate frozen member hand counts, number of weeks, complete unique individual hand numbers, same-cycle member links, and existing selected-hand payout links. Preserve 50 LD per hand per day, seven contribution days, and the frozen weekly amount derived from total hands. The current 47-hand cycle remains 16,450 LD per payout.
- Recheck every required member/day contribution record, its same-cycle relationship, fully paid amount/status and expected amount derived from frozen hands. ELIGIBLE alone does not bypass inconsistent records.
- RANDOM uses Node crypto.randomInt across individual PENDING hands. MANUAL uses the same server selection within one requested frozen member's remaining hands. Neither selects all of a member's hands.
- Atomically mark one hand SELECTED, create one DRAWN payout attributed to the authenticated actor, mark the week PAID, and create one RANDOM_PAYOUT or MANUAL_PAYOUT audit containing group/cycle/week/hand/member scope and the frozen amount.
- Unique week/hand constraints and conditional updates reject duplicates/races. Serializable P2034 conflicts retry at most three transaction attempts; exhausted conflicts and unique P2002 conflicts return 409. Audit or other transaction failures roll back all financial changes. Error responses are generic and private/no-store.

Schema uniqueness constraints remain unchanged. No migration, seed, reset or real financial testing is authorized.

## Guarded staging verification

Use the development Codespace with the existing staging guard variables and empty application tables. Do not recreate temporary Preview access or print secrets. This runs local Next HTTP against staging and does not launch a browser or perform authenticated writes against deployed Vercel.

```bash
node scripts/verify-group-reads-live.mjs --payout-selection
```

Require BOTH:

- `PASS: live group payout selection, permissions, hand integrity, audit and concurrent HTTP checks passed against staging.`
- `PASS: synthetic fixtures removed; application tables empty and login attempts unchanged.`

The fixture creates only synthetic 15-member/47-hand records, two sequential finished ELIGIBLE weeks, and 105 fully paid contribution records per week. It tests anonymous/operator/global-admin denial, legacy bypass denial, request spoofing, cross-origin/group/week/member access, OPEN and future/inactive weeks, partial records, missing and foreign-linked hands, revoked membership and expired/revoked sessions. It then performs one MANUAL selection for the ten-hand member and a concurrent RANDOM selection for the second week: exactly one concurrent request must succeed, the other must return 409, two distinct hands must be selected in total, 45 must remain pending, and each payout must have exactly one scoped authenticated audit. Daily records and the other group's week must remain unchanged.

Cleanup deletes only payout records linked to exact synthetic week/hand/actor identities, their scoped audits and the exact second-week payment IDs, then the existing synthetic hand/week/member fixture cleanup. Preserve login attempts. A cleanup PASS alone is not functional PASS.

## Verification status and next step

Local focused tests, types, lint and build are required before publishing the development Preview. Staging functional verification remains PENDING until both PASS messages are inspected. Do not describe the application as fully group-isolated or fully secure. After this backend passes, build the group payout interface as a separate milestone; the deferred completion browser milestone remains outstanding before production release.
