# V2.11 BlessBoard Member Invitation Contract

Status: schema implemented and locally verified; invitation runtime remains
unimplemented.

## BB-11C1 identity ownership resolution

The activation contract is documented in
`docs/architecture/V211_BB_MEMBER_ACTIVATION_IDENTITY_CONTRACT.md`.
Invitation-token possession is not existing-account ownership proof unless a
future approved email delivery/verification contract confirms delivery.
Email and phone equality alone cannot link an existing user. Existing-user
linking requires an authenticated session for that exact user or an equivalent
approved ownership challenge.

New-account activation is blocked until email delivery verification exists.
Phone-only members remain pending. Cross-church memberships are explicit and
church-scoped; activation grants no staff catalogue role and changes only the
intended member linkage/access state.

## Decision

Choose **Option B: a separate member activation invitation table**. Extending
`blessboard.user_invitations` would require weakening its staff-only
`role_key` contract and would make `/invite/accept` assign a staff catalogue
role to an ordinary member. A separate table preserves the existing staff
flow and makes the member target explicit.

## Existing contracts

- Staff invitations: `db/migrations/blessboard/032_create_user_invitations.sql`,
  extended by `055`, `072`, `073`, and `114`; service
  `src/blessboard/services/inviteBlessBoardStaff.js`.
- Member target: `blessboard.members` and
  `blessboard.member_branch_memberships`, migration
  `db/migrations/blessboard/020_create_members_memberships_registrations.sql`.
- Product user identity: `blessboard.users`, migration
  `db/migrations/blessboard/004_create_users.sql`; optional
  `members.user_id` is the existing link.
- Platform identity foundation: `platform.identities`, migration
  `db/migrations/platform/020_platform_identities.sql`; current BlessBoard
  credential transition remains on `blessboard.users`.
- Audit: existing BlessBoard audit service and `church_audit_logs` contract.

## Proposed member invitation table

Migration: `db/migrations/blessboard/129_member_portal_invitations.sql`.
It was applied only to the verified local V2.11 test database.

`blessboard.member_portal_invitations`:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `organization_id UUID NOT NULL REFERENCES platform.organizations(id)`
- `church_id UUID NOT NULL REFERENCES blessboard.churches(id)`
- `branch_id UUID NULL REFERENCES blessboard.branches(id)`
- `member_id UUID NOT NULL REFERENCES blessboard.members(id)`
- `recipient_user_id UUID NULL REFERENCES blessboard.users(id)`
- `token_hash TEXT NOT NULL CHECK (char_length(token_hash) = 64)`
- `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
  ('pending','accepted','revoked','expired'))`
- `purpose TEXT NOT NULL CHECK (purpose = 'MEMBER_PORTAL_ACTIVATION')`
- `expires_at TIMESTAMPTZ NOT NULL`
- `invited_by_user_id UUID REFERENCES blessboard.users(id) ON DELETE SET NULL`
- `accepted_at TIMESTAMPTZ NULL`
- `accepted_user_id UUID NULL REFERENCES blessboard.users(id) ON DELETE SET NULL`
- `revoked_at TIMESTAMPTZ NULL`
- `revoked_by_user_id UUID NULL REFERENCES blessboard.users(id) ON DELETE SET NULL`
- `created_at`, `updated_at` with the existing monotonic timestamp check.

An ownership trigger must require organization/church consistency, require a
branch to belong to the church, and require the member to belong to the
church. It must not permit a member invitation to target an archived or
inactive member. A partial unique index on `(member_id) WHERE status =
'pending'` provides one active invitation per member. A unique index on
`token_hash`, plus indexes on `(church_id,status,expires_at)` and
`organization_id`, provide lookup and cleanup support.

## Identity and access policy

- HQ actors need the existing church-scoped member invitation permission.
- Branch actors need the existing branch-scoped permission and the member's
  primary/target branch must be within their authorized branch scope.
- View-only and ordinary members are denied.
- The adapter accepts authoritative IDs from the server-side member lookup;
  submitted tenant IDs are never authoritative.
- A member with `user_id IS NULL` may be invited only when a verified
  recipient identity can be established by the future activation flow.
- Email string equality alone never links an identity. Ownership verification
  is required.
- Phone alone never links an identity and phone-only members remain pending.
- An existing user in another church is not granted access to this church
  implicitly; explicit account-linking/consent policy is required.
- No staff or administrative role is assigned. Member portal access is
  represented by the intended membership/user link and existing member
  session policy.
- Already activated members are ineligible unless an explicit resend policy
  is later approved.

## State and transaction

Create: `pending`, with a 7-day expiry and a random 32-byte raw token whose
hash is stored. The raw token is returned once to the caller and never
logged or persisted.

Accept atomically:

1. Hash and lock the invitation row.
2. Require pending status, correct purpose and unexpired token.
3. Lock and validate organization, church, branch and member ownership.
4. Resolve or create the intended `blessboard.users` identity only after
   approved ownership/password verification.
5. Link only the intended member and preserve all unrelated memberships.
6. Set the approved portal activation state; do not grant staff roles.
7. Mark the invitation accepted.
8. Record invitation accepted and member activation audit events.
9. Commit; create no session until commit succeeds.

Replay returns a generic invalid/consumed result and makes no mutation.
Resend must revoke the prior pending row before creating one replacement.
Revocation is actor-scoped and audited. Interrupted transactions roll back
the identity link, activation, invitation consumption and audit writes
together.

## Compatibility and rollback

Staff rows and queries remain untouched. The new table is additive and has no
backfill requirement. Rollback is safe before use by dropping only the new
table and its indexes; after invitations exist, operational revocation and
expiry must precede removal. No historical migration should be edited.

## Implementation and tests

Future files should include a member invitation repository/service adapter,
activation adapter around existing password/session security, and focused
HQ/branch routes only after the contract is approved. Tests must cover staff
regression, target integrity, tenant/branch isolation, new and existing
account paths, email ownership, phone-only rejection, expiry, revoke,
resend, replay, concurrent acceptance, least privilege and audit atomicity
against `getpro_v211_test_01`.

## V2.11 existing-user issuance enforcement

For V2.11, issuance and resend require `members.user_id` to reference an
existing trusted BlessBoard user. Unbound members return the safe
`identity_required` validation result before token generation or replacement;
HQ and branch HTTP mutation routes return **400** and do not create or
replace invitations. The administrator page displays the eligibility
requirement and exposes no issue/resend form for unbound members.

Legacy pending unbound rows are not bulk-deleted. Their acceptance remains
blocked by `OWNERSHIP_PROOF_REQUIRED` until an approved ownership workflow
exists. New-account registration and independent email/phone verification
remain outside V2.11.

## Open decisions

Approve the member-to-user linking proof, cross-church identity behavior,
phone-only delivery/verification, whether `portal_access_status` changes at
acceptance or first login, resend/rate limits, and the exact member-level
permission/session representation before implementation.

## BB-11B4 issuance adapter

`src/blessboard/services/memberPortalInvitationService.js` now exports
`issueMemberPortalInvitation`, `resendMemberPortalInvitation` and
`revokeMemberPortalInvitation`. It uses `members.create` authorization,
row-locked transactions, migration-129 storage, existing token hashing and
BlessBoard audit events. A raw token is returned only for new issuance and
is never logged or audited. Activation acceptance, delivery and UI remain
unimplemented.
