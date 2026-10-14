# Group payout interface verification

## Verified backend prerequisites

Payout options passed guarded staging HTTP and cleanup checks at `921b09c`. Payout selection passed guarded staging HTTP and cleanup checks at `4f0608f`, as confirmed by the user's October 14 screenshot. The week-completion browser check remains parked and UNVERIFIED by explicit user instruction; do not rerun it as part of this milestone. Production release is not authorized.

## Interface behavior

- `/payouts?group=...` uses authenticated identity and fresh group membership. ADMIN/OWNER access is based on the group role, so global VIEWER can act in a group where authorized. OPERATOR, missing and foreign group selection show a denial with no payout register or controls. No selected group prompts group choice. The existing legacy panel remains for global ADMIN accounts with no staff-group context; its API is restricted to unassigned cycles.
- Read options on the server, scoped through the verified group options reader. Freeze member names for display, show each member once with remaining hands, and disable depleted members for manual selection. Controls are disabled until hydration. Empty eligible weeks or zero remaining hands expose no financial action.
- RANDOM and MANUAL confirmations state the week, amount and one-hand rule. MANUAL also states the member and trimmed reason up to 500 characters. Cancelling sends no request. The client sends only allowed fields to the selected group's payout endpoint.
- Lock controls during selection, with a synchronous ref guarding duplicate clicks. A 30-second timeout reports an uncertain outcome. Validate successful response identity, week, method, amount, frozen member, reason, hand and DRAWN status before displaying success.
- Every submitted outcome keeps controls locked until Reload payout options obtains fresh server state. Denied, aborted or malformed responses cannot trigger an immediate retry. A confirmed success shows the selected individual hand and explicitly says cash collection has not been confirmed. Reload refreshes week eligibility and remaining hand counts.
- Error states are visible through role=alert; confirmed selection uses role=status. Group links preserve the selected group. Browser and server errors are logged only as safe categories in the checker.

## Guarded mobile staging check

This new check deliberately builds Next before creating synthetic fixtures, then runs `next start` against staging. It does not compile the development server while Chromium runs. This reduces overlapping work; it is not proof of the underlying cause of the parked browser crash/server exit.

Use the development branch, existing staging guard variables, empty application tables and no temporary Preview account. Do not run another local Next server concurrently with this check, since they would share build output. It does not rerun the parked week-completion test. It performs synthetic selections only; no real cash collection.

```bash
node scripts/verify-group-reads-live.mjs --payout-ui
```

Require BOTH:

- `PASS: mobile group payout selection, confirmation, locking, permissions and error feedback passed against staging.`
- `PASS: synthetic fixtures removed; application tables empty and login attempts unchanged.`

The 390×844 check exercises group selection, global-VIEWER/group-ADMIN access, OPERATOR and foreign-group denial, frozen member counts, no horizontal overflow, cancelled confirmation, malformed success, required manual reason, pending locks, one manual hand for the ten-hand member, revoked access, connection failure, one OWNER random selection and fresh empty-week reload. It verifies two distinct DRAWN payouts with scoped authenticated audits, 45 remaining pending hands, unchanged contribution records/other-group week and no cash-collection confirmation. Cleanup reuses the exact synthetic payout/hand/week/member cleanup from the passed backend test and preserves login attempts.

The runner checks the branch, target database and Prisma model first. A local UI build failure creates no synthetic records. The browser build/start path applies only to `--payout-ui`; existing HTTP verification modes remain unchanged.

## Status

Local helper and actual React server-render checks, types, lint, full build and React review are required before publishing. Mobile staging functionality remains PENDING until both messages are inspected. READY alone does not establish functional success. Payout history and collection confirmation remain separate milestones; the parked completion check still needs resolution or equivalent controlled verification before production release.
