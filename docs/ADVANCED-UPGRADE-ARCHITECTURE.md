# Advanced SUSU Management Upgrade — Architecture & Delivery Plan

## Product decision

The application is evolving from a single-group SUSU administration tool into a multi-tenant SUSU management platform.

Confirmed decisions:
1. One user may own multiple SUSU groups.
2. Groups are fully isolated from one another.
3. Any registered user may create a group and becomes its OWNER.
4. The product should be designed as a SaaS-style platform, even if no billing is introduced initially.
5. The existing 47-hand SUSU is the first group/cycle and must be preserved.

## Non-negotiable safety rules

- Main branch remains the stable production baseline.
- All advanced-upgrade work stays on `advanced-susu-management-upgrade` until explicitly approved.
- Do not change financial rules accidentally.
- Do not silently rewrite historical cycle snapshots.
- Never expose one group's data to another group.
- Never allow member users to access staff/admin data outside their authorization.
- Never run a new Prisma migration against the existing production database until a safe migration/development database strategy is verified.
- Preview deployments must not be allowed to mutate production data unintentionally.
- Every financial/admin mutation remains auditable.

## Target product layers

### Public
- Landing page
- Product/how-it-works pages
- Contact/support page
- Public group information only where explicitly enabled
- Sign up / sign in

### Account
- Account profile
- Group switcher
- Create group
- Invitations
- Membership/role management

### Member portal
- My dashboard
- My contributions
- My balance
- My hands
- My payout history
- My profile
- Notifications (later)

### Staff/admin
- Group dashboard
- Current week/payment register
- Members
- Weeks/history
- Payouts
- Reports
- Audit
- Group settings

## Multi-tenant domain model

The target hierarchy is:

Platform
  -> User
  -> Group
       -> GroupMembership
       -> Member
       -> Cycle
            -> CycleMember
                 -> CycleHand
            -> Week
                 -> DailyPayment
                 -> Payout
       -> AuditLog

Important distinction:
- User = login identity.
- GroupMembership = user's role inside a specific group.
- Member = a SUSU participant in a group.
- Cycle = a historical/configured SUSU run.
- CycleMember = frozen membership snapshot for a cycle.
- CycleHand = independent payout position.
- Payments/payouts belong to a cycle through their existing relationships.

## Authorization model

Global platform role should not control group financial access.

Primary group roles:
- OWNER: full group administration and ownership transfer/deletion/archive controls.
- ADMIN: group administration and financial administration.
- OPERATOR: operational payment/member workflows allowed by policy.
- MEMBER: only their own member data and permitted group information.

A user may have different roles in different groups.

All protected queries and mutations must resolve an authorized group context before reading/writing group data.

## Group isolation

Every group-scoped query must be constrained by an authorized group ID.

Examples:
- A payment query must resolve through a cycle belonging to the active group.
- A payout query must resolve through a week/cycle belonging to the active group.
- A member query must only return members belonging to the active group.
- Audit logs must be group-scoped.
- A member must never be able to select another group's member/cycle/hand IDs.

IDs are not authorization. Ownership/group membership must always be checked server-side.

## Cycle rules

A group can have multiple cycles over time.

Each cycle stores immutable snapshots of the rules needed to interpret its historical financial data:
- contribution amount per hand/day
- days per week
- total hands
- weekly payout
- dates
- member names/hands snapshots

Changing group settings must not rewrite a completed or active cycle's historical meaning.

## Group creation

Recommended onboarding wizard:
1. Group identity
2. Contribution rules
3. Cycle schedule
4. Add/import members
5. Review calculated totals
6. Confirm and create
7. Owner lands on the group dashboard

The system should calculate totals instead of requiring the user to manually enter derived financial figures.

## Registration and invitations

Do not permit anonymous users to create financial member records.

Recommended flows:
- Anyone may create a platform account.
- A registered user may create a group and becomes OWNER.
- Owner/admin can invite or add members.
- A member account can be linked to an existing member record.
- Optional join-code/request flow may be added later with administrator approval.
- Account identity and SUSU member identity remain separate concepts.

## Existing group migration

The current 47-hand SUSU becomes the first group.

No existing financial record should be discarded.

Migration must preserve:
- existing members
- existing cycle
- 47 hands
- weeks
- daily payments
- payouts
- audit history
- existing user access

The migration should be rehearsed against a copy/staging database before touching production.

## Branding

Platform-level:
- strong primary logo
- compact/app icon
- favicon
- light/dark variants
- consistent brand typography and colors

Group-level:
- group name
- optional group logo
- description
- contact information

Group branding must never override platform security or confuse the platform identity.

## Public pages

Recommended:
- Landing
- How it works
- Features
- Contact
- Privacy
- Terms
- Sign in
- Create account
- Create group

Public pages must not expose private member/payment data.

## Search and filtering

Staff:
- member search
- payment status filters
- active/inactive member filters
- payout filters
- cycle/week filters

Members:
- their own history/search where useful

Search must always remain group-scoped.

## Contact/support

Platform support:
- support email
- phone/WhatsApp where configured
- contact form
- help/FAQ

Group contact details:
- optional and controlled by the group owner.

## Data export and recovery

Planned:
- group data export
- payment/payout reports
- CSV/Excel export
- backup/recovery procedures
- archive rather than destructive deletion for financial groups

## Delivery phases

### Phase 0 — Architecture and safety
- Freeze main baseline.
- Create advanced-upgrade branch.
- Document target architecture.
- Establish migration/development database strategy.
- Audit existing APIs for single-group assumptions.

### Phase 1 — Identity and tenancy foundation
- Introduce Group.
- Introduce GroupMembership.
- Define ownership and roles.
- Add group context/session selection.
- Add authorization helpers.
- Add tenant-scoped audit model.
- Build migration rehearsal.
- Do not alter production until verified.

### Phase 2 — Existing group migration
- Attach current data to the first group.
- Preserve all financial records.
- Verify totals and payout history.
- Verify authorization boundaries.

### Phase 3 — Account and onboarding
- Public account registration.
- Login/session improvements.
- Create group wizard.
- Group switcher.
- Invitation/member linking.

### Phase 4 — Member portal
- Member dashboard.
- Contributions.
- Balance.
- Hands.
- Payout history.
- Profile.

### Phase 5 — Public product
- Landing page.
- Brand/logo.
- How it works.
- Contact.
- Privacy/terms.
- Public-safe group information.

### Phase 6 — Staff usability
- Search/filter.
- Dashboard improvements.
- Exports.
- Operational tooling.

### Phase 7 — Security and production readiness
- Cross-tenant authorization tests.
- Role matrix tests.
- Financial invariant tests.
- Migration rehearsal.
- Backup/recovery test.
- Production deployment verification.

## Definition of done for the advanced upgrade

The upgrade is not complete until:
- multiple groups can coexist safely;
- one user can own multiple groups;
- users can switch groups without leaking data;
- group roles are enforced server-side;
- the existing 47-hand group remains financially identical;
- members cannot access staff/admin functions;
- public pages expose no private data;
- historical cycles remain immutable snapshots;
- audit records identify the group and actor;
- migrations are rehearsed safely;
- production deployment is READY;
- main is merged only after explicit approval.
