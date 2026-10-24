# V211-BB-QA90 Member Activation Implementation

Implemented the missing ordinary-member invitation boundary without changing
the existing staff invitation contract.

## Changes

- Added additive migration `db/migrations/blessboard/111_member_portal_invitations.sql`.
- Added `memberPortalInvitationService` with:
  - cryptographically random, hash-only tokens;
  - seven-day expiry;
  - pending-member and church/organization/branch scope checks;
  - safe reissue/revocation;
  - one-time transactional acceptance;
  - platform-user creation and member binding;
  - portal activation and audit events.
- Added authenticated HQ endpoint:
  `POST /hq/members/:id/invitation`.
- Added public acceptance endpoints:
  `GET /member/invite/accept` and `POST /member/invite/accept`.

Acceptance refuses blocked, already-bound, expired, revoked, replayed, and
identity-conflict invitations. It creates no staff roles.

## Verification

JavaScript syntax checks and `git diff --check` pass. Full database-backed HTTP
verification was not run because applying the new migration to the authorized
database would be a migration mutation explicitly excluded from this QA
execution request. Browser click-through is also unverified.

The existing QA87 member remains unchanged until the migration is applied
through the normal schema lifecycle and the focused HTTP workflow is run.
