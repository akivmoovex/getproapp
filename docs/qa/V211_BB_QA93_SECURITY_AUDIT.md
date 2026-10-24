# V211-BB-QA93 Independent Member Invitation Security Audit

## Classification

`CRITICAL`: not safe for disposable-database migration or integration testing
until the session handoff and acceptance contract are corrected.

## Findings

### CRITICAL — acceptance does not establish a supported login/session

`src/blessboard/http/inviteAcceptRoutes.js:124-137` calls the service and
returns “You may now sign in”, but does not create a session or redirect to the
normal login flow. `memberPortalInvitationService.js:188-207` creates a
platform user but does not establish a supported member session. The existing
member portal middleware consumes its own verified member session and active
membership checks. A successful acceptance therefore does not prove portal
access and could leave an account with no usable product login path.

Required correction: use the canonical login/account-activation flow and verify
the V2.11 portal authorization contract after authentication.

### HIGH — no rate limit on public acceptance

`inviteAcceptRoutes.js:124-138` has CSRF validation but no acceptance
rate-limit gate. CSRF does not provide brute-force protection for invitation
tokens or password attempts.

Required correction: apply the existing password/invitation rate-limit service
before token processing.

### HIGH — branch membership is not enforced by the migration trigger

`111_member_portal_invitations.sql:28-56` verifies that member and branch
belong to the church, but does not verify an active
`member_branch_memberships` row for that branch. The application query only
selects a primary active membership during issuance; direct SQL can create a
validly constrained invitation for a non-member branch.

Required correction: enforce branch membership in the application transaction
and retain a fail-closed database invariant where feasible.

### MEDIUM — new-account creation has no explicit verification state

`memberPortalInvitationService.js:188-196` creates an active platform user
from the invitation token and password, without an explicit email/phone
verification step. This may be acceptable only if the invitation itself is
the approved ownership proof and must be documented as such.

### MEDIUM — audit does not cover acceptance

The issue and revoke paths record audit events, but
`acceptMemberPortalInvitation()` does not record a corresponding accepted
member activation event.

## Positive controls

- Token generation uses `crypto.randomBytes(32)` and persistence uses
  `hashSessionToken`.
- Expiry and pending-status checks are present.
- `SELECT ... FOR UPDATE` plus a transaction prevents concurrent double
  consumption.
- Revoke/reissue status checks and the unique pending-member index are present.
- Existing-account binding rejects email-only binding unless the authenticated
  user ID matches.
- Acceptance does not set member status or portal access active.
- The migration is additive, uses canonical BlessBoard/platform foreign keys,
  has no legacy `public.*` dependency, and contains no destructive DDL.
- Scope trigger checks organization, church, member and branch ownership.
- HQ issuance uses the existing `members.create` authorization and CSRF gate.
- No staff roles are assigned.

## Safe static verification

JavaScript syntax checks pass for the three modified runtime files and
`git diff --check` passes. No database writes or migration execution occurred.
No database-backed authorization or browser test was run.

## Decision

`SAFE_TO_APPLY_DISPOSABLE_MIGRATION=NO` until the critical session handoff and
the high-severity rate-limit and branch-membership controls are addressed.
