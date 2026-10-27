# V211-QA139 BlessBoard Route-Mount Audit

## Profile contract

`blessboard-org-staging` is a BlessBoard profile with `runtimeMode=v5-foundation`,
`productSelection=profile`, `deploymentEnvironment=testing`,
`canonicalDomain=blessboard.org`, `sessionCookieName=blessboard_org_sid`,
`csrfCookieName=blessboard_org_csrf`, and diagnostic host context.

`blessboard-pronline-testing` is also `v5-foundation`, but uses
`blessboard.pronline.org`, `blessboard_pronline_sid` and
`blessboard_pronline_csrf`. `moovex-platform-testing` is the canonical
platform profile, uses hostname product selection, `pronline.org` as the
canonical domain, `blessboard.pronline.org` as the church host domain, and
`moovex_platform_testing_sid`/`moovex_platform_testing_csrf`. All testing
profiles expect the testing database environment and the
`moovex-platform-v7` identity where configured.

## Mount evidence

`src/platform/http/v5FoundationServer.js` imports and mounts the V2.11
routers, including `createHqMembersAdminRouter`,
`createInviteAcceptRouter`, `createMemberPortalInvitationAcceptRouter`,
`createMemberPortalInvitationAdminRouter`, `createMemberPortalRouter`,
`createMemberPortalAuthRouter`, `createTenantRegistrationRouter` and the
website/announcement routers. The V5 foundation profile does not inherently
mean these routes are absent.

The QA138 browser harness set `BASE_DOMAIN=local.test` while sending
`X-Forwarded-Host=qa75-91225-1792873862949.blessboard.org`. This conflicts
with the QA105 working `BASE_DOMAIN=blessboard.org` authoritative tenant
configuration. The first incorrect behavior is the host/profile resolution
redirect to the BlessBoard home-site login, which then loops when the browser
continues requesting the local origin. No authorization middleware was
disabled.

## Route contract

| Family | Route owner / path | Required contract |
|---|---|---|
| Public church registration | V5 tenant/public registration router | BlessBoard tenant host; V5 session/CSRF |
| Member registration | V5 tenant registration/member route | BlessBoard tenant context; CSRF |
| HQ login | V5 foundation `/login` | Apex/tenant transfer or authoritative tenant host; V5 cookie |
| HQ member administration | `createHqMembersAdminRouter`, `/hq/members` | V5 authenticated HQ session and church scope |
| Staff invitation issuance | HQ staff router/invitation service | V5 HQ session, church scope, CSRF |
| Staff invitation acceptance | `createInviteAcceptRouter` | Public V5 acceptance path and one-time token |
| Member invitation | member invitation admin/accept routers | Active member/branch state, V5 session where protected |
| Member Portal | `createMemberPortalRouter` and auth router | Canonical V5 member session and tenant/branch scope |

The QA137 route assumptions are not themselves obsolete, but the browser
harness host/base-domain pairing is incorrect. The smallest safe next action
is to run the browser server with `BASE_DOMAIN=blessboard.org`,
`PLATFORM_DEPLOYMENT_CODE=blessboard-org-staging`,
authoritative routing, and the QA105 allowlisted tenant host, while retaining
the authorized disposable database.

No database mutation, migration, product change, commit or push was performed.
