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

## First mobile staging attempt

The user supplied output on October 13 showing a TimeoutError at `owner-completion-pending-lock`, followed by cleanup PASS only. Earlier stages returned without failure, but the broad label did not identify whether the click, pending lock, response or reload timed out. The mobile functional milestone remains pending.

The checker now explicitly waits for a new document after Reload week, waits for an enabled OWNER control, observes the gated POST before awaiting the click, then releases the gate before awaiting the response/navigation. This removes potential navigation/gate ordering ambiguity; it does not prove the original cause. Fine-grained stage labels and safe synthetic UI/status diagnostics distinguish subsequent failures. Application behavior and financial rules are unchanged by this checker refinement.


## Second mobile attempt and navigation investigation

The second attempt at `bab8fbd` timed out at `operator-hidden`, before any payment register or completion request appeared. Cleanup passed, but no functional PASS occurred. This does not identify an OWNER permission defect or establish the cause.

The checker now separates `*-navigation`, `*-register-render`, and `*-payment-client-ready`. It records the navigation HTTP status, a fixed location category (current-week/login/other), redirect presence, recognized page-state flags, failed client resource counts, and synthetic-only session/membership/cycle/week relationship checks. Initial authenticated session and scoped current-week API reads report status, expected identity matches and record counts, without printing response bodies. An API success is evidence about that read, not proof that the page rendered.

The guarded runner captures local Next output privately and reports only fixed error categories and counts on failure; raw server lines, database connection strings, session tokens, response bodies and member names are never printed. Preview logs cannot explain this local-server failure. Empty categories do not prove absence of a server error; classification is deliberately limited.

These changes add evidence only. No application behavior, authorization or financial rules changed. Staging functional verification remains pending; require BOTH PASS messages before advancing. Do not reset, seed or restore the temporary account for this check.


## Third mobile attempt: revoked-permission stage

The user screenshot for `1c193cf` showed `permission-revoked-after-load`, failure type `BrowserError`, unavailable page/database diagnostics, empty local-server error categories, and cleanup PASS only. The earlier operations returned without failure in this run; that is not a full mobile functional PASS. No cause is established by the broad stage or empty error categories.

The checker now names membership revocation, response-listener setup, click, HTTP response, feedback, payment lock, audit check, reload click/navigation/document readiness/register/client readiness, and hidden-control assertion separately. Reload waits for DOMContentLoaded after the main-frame navigation event before inspecting the new document. Browser error messages are privately classified into fixed operation and failure flags; raw messages are never printed. Page close/crash and browser disconnect flags plus numeric completion response statuses are retained without evaluating the page. Page and synthetic database diagnostics run independently so an unavailable page context cannot suppress the database evidence.

Application code and financial rules remain unchanged. The cause and complete mobile functional verification remain pending. Require BOTH functional and cleanup PASS messages.
