# Group week-completion interface check

## Verified prerequisite

On October 13, 2026, the user supplied output from `--complete-week` showing BOTH the functional HTTP PASS and cleanup PASS. This ran the branch code through a local Next server connected to guarded staging, with actual cookies and Prisma queries. It was not a direct authenticated financial write against Vercel.

The temporary Preview account was removed successfully beforehand. Application tables were empty after cleanup; existing login-attempt records were unchanged.

## Interface behavior

- Group ADMIN and OWNER see completion controls for an OPEN week. Group OPERATOR can record payments but cannot complete; global ADMIN does not bypass group authorization.
- The control remains disabled before client handlers are ready, while payments have drafts or saves, or after uncertain payment responses.
- Readiness uses saved amounts, status and complete unique contribution-day slots for each frozen member. Sunday must end at the existing UTC boundary. Server transaction validation remains authoritative.
- Confirmation explains that completion locks contribution editing and makes the week eligible for payout. Cancelling sends no request.
- Only `{weekId}` is sent to the selected group's completion endpoint.
- During completion, contribution inputs are locked. Success reloads server state; any denied or uncertain response keeps inputs locked and offers Reload week.
- This does not draw a hand or record a payout. Legacy completion controls are unchanged.

## Local validation

Focused readiness, backend atomicity, permissions and fixture checks passed (7 tests), along with TypeScript, targeted React lint, script syntax checks, full production build and actual React server-render checks for pre-hydration locking and hidden controls. Browser verification remains pending until BOTH messages below appear.

## Guarded mobile staging check

Use the development branch with the existing guarded staging variables. Do not print connection strings. If temporary Preview access has been recreated, remove it with the guarded `preview-access.mjs --remove` first and verify its PASS. Do not bypass a refusal.

```bash
node scripts/verify-group-reads-live.mjs --complete-week-ui
```

Requires BOTH:

- `PASS: mobile group week-completion readiness, permissions, locking and error feedback passed against staging.`
- `PASS: synthetic fixtures removed; application tables empty and login attempts unchanged.`

The check uses a 390×844 browser, synthetic 15-member/47-hand records, real session cookies and staging queries. It checks OPERATOR-hidden controls, ADMIN readiness, cancelled confirmation, partial and pending payments, Sunday timing, revoked permission, OWNER completion, connection failure, locking, read-only reload, scoped audit attribution, other-group denial and no payouts. It reports the named failing step. Only intended synthetic identities and financial records are removed; login attempts remain unchanged.

A cleanup PASS alone is not a functional PASS. Investigate the named failure before rerunning. Do not reset or seed the database. This check uses a local Next server against staging; Preview READY and absence of Preview error logs alone do not prove financial functionality.
