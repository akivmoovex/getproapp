# V211-BB-QA105 Tenant Authorization and Member Workflow

## Tenant authorization diagnosis

The prior `403` was caused by the process-local app missing the tenant
routing configuration, not by the QA75 session or role. With the correct
synthetic host and local settings:

- `BASE_DOMAIN=blessboard.org`
- `BLESSBOARD_TENANT_ROUTING_MODE=authoritative`
- `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=qa75-91225-1792873862949.blessboard.org`

the same supported `createV5Session` session produced `GET /hq/members = 200`.
The QA75 user has the existing active church-scoped
`organisation_administrator` assignment. No role or database fixture was
changed.

## Workflow blocker

The real invitation POST reached the handler but returned `400`. Read-only
state shows the QA87 member's primary branch membership is:

- member status: `pending`
- portal access: `not_activated`
- user binding: absent
- membership status: `pending`

`memberPortalInvitationService.loadEligibleMember()` and migration 130 require
an `active` `member_branch_memberships` row before issuing an invitation.
The requested lifecycle requires invitation before the separate membership
approval step, so the current application contract cannot issue the invitation
to this pending QA87 member. No direct SQL correction was made.

No invitation token was created, and no acceptance, approval, login, portal or
negative security workflow was attempted after the blocker.
