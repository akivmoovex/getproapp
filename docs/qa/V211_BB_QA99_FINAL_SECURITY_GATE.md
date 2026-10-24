# V211-BB-QA99 Final Member Portal Security Gate

## Gate result

Static review passes the canonical V2.11 portal path. Runtime database and
browser behavior remain `UNVERIFIED`; the pending migration was not applied.

## Flow evidence

`POST /hq/members/new` and `/new/review` create the pending member.
`POST /hq/members/:id/invitation` requires HQ member-create permission and
CSRF, then `issueMemberPortalInvitation()` scopes the invitation to the
server-resolved member, church, organization and active primary branch.

`POST /member/invite/accept` validates CSRF and the hash-only invitation. The
service locks the invitation and member rows in one transaction, rejects
expired/replayed/blocked/bound identities, creates or verifies the platform
identity, binds `members.user_id`, and records acceptance. It does not approve
membership or activate portal access.

Canonical `POST /login` regenerates the platform session. QA96's destination
allowlist permits only local `/member/*` paths. V2.11 portal routes use
`createRequireActiveMember()` and `requireActiveMemberForTenant()`, which
resolve the UUID member from the authenticated platform user and require
active church membership, active branch membership and non-blocked access.
Legacy numeric `churchMember` routes remain separate and fail closed.

## Migration review

`111_member_portal_invitations.sql` is additive, uses canonical platform and
BlessBoard foreign keys, stores a token hash, enforces expiry/status and
single pending invitation per member, and has an insert/update ownership
trigger. The trigger also requires an active member-branch membership and has
no legacy `public.*` dependency. No destructive operation was executed.

## Static evidence and limitations

Five modified runtime JavaScript files pass syntax checks and `git diff
--check` passes. No database, migration, HTTP integration, concurrency,
browser, or protected-database test was run. Therefore token consumption,
session behavior, approval transitions and migration execution remain
unverified at runtime.
