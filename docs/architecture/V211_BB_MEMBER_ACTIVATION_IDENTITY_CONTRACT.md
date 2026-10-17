# V2.11 BlessBoard Member Activation Identity Contract

Status: contract design only. No runtime or migration changes were made in
this batch.

## Existing interfaces

- Member records and optional `members.user_id` linkage:
  `db/migrations/blessboard/020_create_members_memberships_registrations.sql`.
- BlessBoard credentials and user status:
  `db/migrations/blessboard/004_create_users.sql`,
  `src/blessboard/services/createBlessBoardUser.js`,
  `src/blessboard/repositories/blessBoardAuthRepository.js`.
- Existing password policy/hash behavior:
  `src/platform/auth/sharedPasswordPolicy.js` and
  `src/blessboard/services/inviteBlessBoardStaff.js`.
- Existing login/session behavior:
  `src/platform/http/v5FoundationServer.js`,
  `src/platform/session/createV5Session.js`,
  `src/platform/session/readV5Session.js`, and the unified `/login` routes.
- Existing staff acceptance:
  `src/blessboard/services/inviteBlessBoardStaff.js` and
  `src/blessboard/http/inviteAcceptRoutes.js`.
- Member portal scope is based on the BlessBoard member/user relationship and
  church membership repositories; staff catalogue roles are separate.
- New member invitation storage:
  `db/migrations/blessboard/129_member_portal_invitations.sql`.

## Contract decision

### New account

An invitation token alone is not proof of email ownership unless the future
delivery contract guarantees that the token was delivered to the member's
verified email address. Therefore a new account may be created only when:

1. The invitation is pending, unexpired, purpose-bound and member-bound.
2. The invitation has an approved email delivery/verification result.
3. The recipient supplies a valid password under the existing password policy.
4. The transaction creates one `blessboard.users` row with ordinary member
   status, links `members.user_id`, and activates only the intended member
   portal state.

Until delivery/verification exists, the new-account path is blocked. A
copy/share link without an independent verified delivery result is not
sufficient.

### Existing account

An existing account is linkable only from an authenticated session for that
exact user, or a future equivalent verified ownership challenge. Email or
phone equality alone is never sufficient. The acceptance request must compare
the authenticated session user to the invitation's recipient target where one
exists, preserve the password and sessions, and update only the invited
membership.

An unauthenticated user presenting only an email-matching invitation is
rejected or held pending; no account is selected automatically.

### Cross-church memberships

One user may hold separate memberships in multiple churches. Acceptance is
explicit per invitation and church-scoped. Existing memberships, roles and
sessions for other churches are untouched. No church grants permissions to
another church and no staff role is assigned by member activation.

### Phone-only members

Phone-only members remain `not_activated`. No phone-only account linking or
SMS verification is introduced in this batch. A future approved phone
verification flow must establish ownership before activation.

## Member authorization and status

The member record's `user_id` is the linkage authority. The invitation
purpose and member target do not grant staff catalogue roles. Activation must
set only the member portal access state required by the existing member
portal authorization contract; it must not change the church membership
business status unless a separately approved policy requires it.

`not_activated` describes portal credential/access readiness, not absence of
the membership. It must remain pending until ownership proof and password
setup complete. Existing member status and branch membership status remain
separate fields.

## Atomic acceptance

The future `acceptMemberPortalInvitation` transaction must:

1. Hash the presented token and lock the pending invitation.
2. Validate purpose, expiry, status and target ownership.
3. Lock the member and verify church/organization/branch scope.
4. Prove new-email delivery ownership or validate an authenticated existing
   user session.
5. Create or link only the intended user.
6. Update only the intended `members.user_id` and portal state.
7. Consume the invitation and write an audit event.
8. Commit before any session is created.

Unique token hash, pending-member uniqueness and row locks prevent replay and
concurrent double acceptance. Any failure rolls back user creation, linking,
activation, consumption and audit writes together.

## Schema compatibility

Migration 129 supplies the member target, optional recipient user, fixed
purpose, scope, token hash, expiry, status and acceptance/revocation audit
columns. It does not supply email delivery verification state or a proof that
an invitation token was delivered to the intended mailbox. No additional
migration is approved for this design batch.

Before activation implementation, decide whether delivery verification is
represented by a delivery receipt on the invitation or by a separate
verification record. Do not overload `accepted_user_id` or
`recipient_user_id` to mean delivery proof.

## Ordered implementation plan

- **BB-11C2:** implement the ownership-proof boundary and member-only
  authorization adapter; reject unsupported new-account and phone-only paths.
- **BB-11C3:** implement atomic member invitation acceptance for the approved
  proof paths.
- **BB-11C4:** add dedicated member activation HTTP routes and views without
  changing staff `/invite/accept`.
- **BB-11D:** verify member login, session scope and password recovery after
  activation.
- **BB-11E:** implement approved delivery and administrator issuance/resend
  UI.
- **BB-11F:** run PostgreSQL, HTTP, concurrency, tenant, RBAC and audit
  regression.

Remaining policy decisions are delivery proof, existing-account challenge
mechanism, phone verification, portal-state transition timing and the exact
member-level permission representation.

## BB-11C2 boundary implementation

Implemented the non-mutating boundary at
`src/blessboard/services/memberActivationIdentityOwnershipService.js`.
`verifyMemberActivationIdentityOwnership` validates the authenticated user,
purpose, pending/unexpired invitation, authoritative organization/church,
member ownership, recipient-user binding and existing member linkage. It
returns `OWNERSHIP_PROOF_REQUIRED` for unbound invitations and never uses
email or phone equality as proof. `authorizeLinkedMemberAccess` requires an
exact linked user and active portal access.

The boundary performs no account creation, membership mutation, invitation
consumption, role assignment or session creation. Four focused tests pass.

## BB-11C3 acceptance boundary

`src/blessboard/services/memberPortalInvitationAcceptanceService.js` adds
`acceptMemberPortalInvitation` for the approved existing-user path. It
hashes and locks the member-purpose token, revalidates ownership through the
identity boundary inside the transaction, links only the exact authenticated
user, sets the intended portal state, consumes the invitation and records an
audit event before commit. It creates no accounts, passwords or sessions and
does not assign staff roles.

Real PostgreSQL acceptance verification is blocked in the prepared database
because no existing synthetic member is simultaneously linked to a user and
still pending portal activation. A supported fixture must be provisioned
before claiming acceptance green.

The linked-pending fixture is now provisioned in the isolated acceptance test
using the existing BlessBoard user creator and schema-valid member
relationship. Real PostgreSQL acceptance passed: exact recipient ownership,
member linkage, `portal_access_status=active`, invitation consumption and
single-use replay rejection were verified. New-account activation remains
blocked pending verified email delivery proof.
