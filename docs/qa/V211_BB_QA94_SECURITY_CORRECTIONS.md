# V211-BB-QA94 Security Corrections

## Corrections

- Acceptance now redirects to the canonical `/login?next=/member/dashboard`
  route after successful account creation/binding. No custom session or
  session identifier is created.
- Public acceptance POST now uses the existing `express-rate-limit`
  middleware with a bounded 15-minute window and ten attempts.
- Migration scope validation now requires an active
  `member_branch_memberships` row in addition to church, organization and
  branch ownership checks.
- Successful acceptance now records a tenant-scoped
  `member_portal_invitation.accepted` audit event without raw token or
  credential data.
- Pending membership and portal access remain unchanged by acceptance.
- Existing-account binding still requires the authenticated user ID to match;
  email-only claims remain rejected.

## Files changed

- `src/blessboard/http/inviteAcceptRoutes.js`
- `src/blessboard/services/memberPortalInvitationService.js`
- `db/migrations/blessboard/111_member_portal_invitations.sql`

No migration or database was executed. No product runtime deployment occurred.

## Verification

Three modified JavaScript files pass syntax checks and `git diff --check`
passes. QA94 intentionally performed no database-backed or browser tests.
Integration verification remains required after a future disposable-database
migration run.
